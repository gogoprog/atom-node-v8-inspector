# atom-node-v8-inspector

## What is it?

Atom-node-v8-inspector is an Atom plugin that sets breakpoints on JavaScript files and starts the debugging processing using Chrome DevTools and Node v8 inspector integration (node --inspect)

## How does it work?

 * The node process is started using the --inspect flag
 * Chrome dev-tools page is opened but is not connected directly to the node process
 * The plugin establishes a bridge between Chrome and node
 * Breakpoints are set by sending the setBreakpoint command to the node process


