'use babel';

import { CompositeDisposable } from 'atom';

const Chrome = require('chrome-remote-interface');
const WebSocket = require('ws');

export default {

    subscriptions: null,
    v8Inspector: null,
    wsServer: null,

    activate(state)
    {
        this.subscriptions = new CompositeDisposable();
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'atom-node-v8-inspector:debug': () => this.debug()
        }));
    },

    deactivate()
    {
        this.subscriptions.dispose();

        if(v8Inspector != null)
        {
            v8Inspector.close();
        }

        if(wsServer != null)
        {
            wsServer.close();
        }
    },

    serialize()
    {
        return {
            // todo: start parameters
        };
    },

    debug()
    {
        console.log('AtomNodeV8Inspector debug...');

        // todo: run app, store childprocess, get port
        var port = 9229;

        Chrome({'host': 'localhost', 'port': port}, function (instance) {
            v8Inspector = instance;
            const wss = new WebSocket.Server({ port: (port+1) });
            var v8ws = instance._ws;

            wss.on('connection', function connection(ws) {
                ws.on('message', function incoming(message) {
                    console.log('received from wss: %s', message);
                    v8ws.send(message);
                });
                v8ws.on('message', function incoming(message) {
                    console.log('received from v8Inspector: %s', message);
                    ws.send(message);
                });
            });

        }).on('error', function (err) {
            console.error(err);
        });
    },

    sendBreakpoint()
    {
        v8Inspector.Debugger.setBreakpointByUrl({
            lineNumber:666,
            url:"/todo/todo.js",
            columnNumber:0,
            condition:""
        });
    }

};
