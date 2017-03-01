'use babel';
/*jshint esversion: 6 */

import { CompositeDisposable } from 'atom';
import { BufferedProcess } from 'atom';
const { BrowserWindow } = require('electron').remote;

const path = require('path');
const portfinder = require('portfinder');
const Chrome = require('chrome-remote-interface');
const WebSocket = require('ws');
const http = require('http');
const tmp = require('tmp');
const fs = require('fs');

export default {

    subscriptions: null,
    v8Inspector: null,
    v8Port:9230,
    wsServer: null,
    wsPort:9229,
    childProcess: null,
    breakpoints: [],
    markers: {},
    currentPackageJsonPath: null,

    activate(state)
    {
        this.subscriptions = new CompositeDisposable();

        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'atom-node-v8-inspector:debug': () => this.debug(),
            'atom-node-v8-inspector:unset-package-json': () => this.unsetPackageJson()
        }));

        this.subscriptions.add(atom.commands.add('atom-text-editor', {
            'atom-node-v8-inspector:toggle-breakpoint': () => this.toggleBreakpoint()
        }));

        atom.workspace.observeTextEditors((editor) => {
            for(var i in this.breakpoints)
            {
                var bp = this.breakpoints[i];
                if(bp.filepath == editor.getPath())
                {
                    var marker = editor.markBufferPosition([bp.line - 1, 0], {
                        invalidate: 'never'
                    });

                    this.setupMarker(editor, marker, bp);
                }
            }
        });
    },
    deactivate()
    {
        this.subscriptions.dispose();

        if(v8Inspector !== null)
        {
            v8Inspector.close();
        }

        if(wsServer !== null)
        {
            wsServer.close();
        }
    },
    serialize()
    {
        return {};
    },
    debug()
    {
        if(!this.currentPackageJsonPath)
        {
            this.findPackageJsonPath();
        }

        var filePath = atom.workspace.getActiveTextEditor().getPath();
        var fileName = path.posix.basename(filePath);
        var dirName = path.dirname(filePath);
        var that = this;

        portfinder.getPort(function (err, port) {
            that.v8Port = port;
            var args = "--inspect --debug-brk=" + port + " " + filePath;
            args = args.split(' ');

            that.runProcess("node", args, dirName, function(){
                portfinder.getPort(function (err, wsPort) {
                    Chrome({'host': 'localhost', 'port': port}, function (instance) {
                        that.v8Inspector = instance;
                        that.wsPort = wsPort;
                        const wss = new WebSocket.Server({ port: wsPort });
                        var v8ws = instance._ws;

                        console.log('[AtomNodeV8Inspector] wsServer on ' + wsPort);

                        wss.on('connection', function connection(ws) {
                            ws.on('message', function incoming(message) {
                                //console.log('received from wss: %s', message);
                                v8ws.send(message);
                            });
                            v8ws.on('message', function incoming(message) {
                                //console.log('received from v8Inspector: %s', message);
                                ws.send(message);
                            });
                        });

                        that.runChrome(wsPort);
                        that.sendBreakpoints();

                        // todo: Following code will be fine when electron will be updated!
                        /*
                        let win = new BrowserWindow({width: 800, height: 600});
                        win.on('closed', () => {
                          win = null;
                        });
                        win.loadURL('chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=127.0.0.1:' + wsPort);
                        */

                    }).on('error', function (err) {
                        console.error(err);
                    });
                });
            });
        });

        return;
    },
    sendBreakpoint(filepath, line)
    {
        this.v8Inspector.Debugger.setBreakpointByUrl({
            lineNumber:(line - 1),
            url:filepath,
            columnNumber:0,
            condition:""
        });
    },
    sendBreakpoints()
    {
        for(var k in this.breakpoints)
        {
            var bp = this.breakpoints[k];

            this.sendBreakpoint(bp.filepath, bp.line);
        }
    },
    runProcess(command, args, cwd, callback) {
        if(this.childProcess !== null) {
            atom.notifications.addWarning("[AtomNodeV8Inspector] A child process is already running. (" + this.childProcess.command + ")");
            return null;
        }
        var exit, stderr, stdout;
        var that = this;
        stdout = function(output) {
        };
        stderr = function(output) {
            if(output.indexOf('chrome-devtools://') > -1) {
                callback();
            }
        };
        exit = function(return_code) {
            atom.notifications.addInfo("[AtomNodeV8Inspector] Child process has stopped.");
            that.childProcess = null;
            that.v8Inspector.close();
            that.wsServer.close();
            return console.log("Exit with ", return_code);
        };
        console.log('Starting process :', command, args.join(" "), 'in', cwd);
        process.chdir(cwd);
        atom.notifications.addInfo("[AtomNodeV8Inspector] Running command '" + command + "'");
        this.childProcess = new BufferedProcess({
            command: command,
            args: args,
            stdout: stdout,
            stderr: stderr,
            exit: exit
        });

        return this.childProcess !== null;
    },
    runChrome(port)
    {
        var that = this;
        atom.notifications.addInfo("[AtomNodeV8Inspector] Running chrome...");

        tmp.dir(function _tempDirCreated(err, path, cleanupCallback) {
            if (err) throw err;
            var content = `
                {
                  "session": {
                    "restore_on_startup": 4,
                    "startup_urls": [
                      "chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=127.0.0.1:${port}"
                    ]
                  }
                }
            `;

            fs.writeFile(path + "/First Run", "", function(err) {
                fs.mkdir(path+"/Default", function(){
                    fs.writeFile(path + "/Default/Preferences", content, function(err) {
                        new BufferedProcess({
                            command: that.getChromePath(),
                            args: ["--user-data-dir=" + path]
                        });
                    });
                });
            });
        });
    },
    getChromePath()
    {
        // todo: platform dependent, chrome or chromium etc.
        return "chromium";
    },
    toggleBreakpoint()
    {
        var editor, index, item, marker, range;
        editor = atom.workspace.getActiveTextEditor();
        item = {
            filepath: editor.getPath(),
            filename: path.basename(editor.getPath()),
            line: Number(editor.getCursorBufferPosition().row + 1)
        };
        index = this.findBreakpointIndex(item);
        if (index === -1) {
            this.breakpoints.push(item);
            range = editor.getSelectedBufferRange();
            marker = editor.markBufferRange(range, {
                invalidate: 'never'
            });
            this.setupMarker(editor, marker, item);
            console.log("Added breakpoint:", item.filename, ":", item.line);
        } else {
            this.breakpoints.splice(index, 1);
            this.markers[this.generateKey(item)].destroy();
            console.log("Removed breakpoint:", item.filename, ":", item.line);
        }
    },
    setupMarker(editor, marker, item)
    {
        editor.decorateMarker(marker, {
            type: 'line-number',
            class: 'syntax--breakpoint'
        });
        this.markers[this.generateKey(item)] = marker;
        marker.item = item;
        return marker.onDidChange(function(event) {
            var new_line, old_line;
            old_line = event.oldHeadBufferPosition.row + 1;
            new_line = event.newHeadBufferPosition.row + 1;
            marker.item.line = new_line;
            console.log("Moved breakpoint:", item.filename, ":", old_line, "to", new_line);
        });
    },
    generateKey(item)
    {
        return item.filename + ":" + item.line;
    },
    findBreakpointIndex(_item)
    {
        var i, item, length;
        i = 0;
        length = this.breakpoints.length;
        while (i < length) {
            item = this.breakpoints[i];
            if (item.filepath === _item.filepath && item.line === _item.line) {
                return i;
            }
            ++i;
        }
        return -1;
    },
    unsetPackageJson()
    {
        this.currentPackageJsonPath = null;
    },
    findPackageJsonPath()
    {

    }
};
