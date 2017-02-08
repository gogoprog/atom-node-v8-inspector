'use babel';

import AtomNodeV8InspectorView from './atom-node-v8-inspector-view';
import { CompositeDisposable } from 'atom';

export default {

  atomNodeV8InspectorView: null,
  modalPanel: null,
  subscriptions: null,

  activate(state) {
    this.atomNodeV8InspectorView = new AtomNodeV8InspectorView(state.atomNodeV8InspectorViewState);
    this.modalPanel = atom.workspace.addModalPanel({
      item: this.atomNodeV8InspectorView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'atom-node-v8-inspector:toggle': () => this.toggle()
    }));
  },

  deactivate() {
    this.modalPanel.destroy();
    this.subscriptions.dispose();
    this.atomNodeV8InspectorView.destroy();
  },

  serialize() {
    return {
      atomNodeV8InspectorViewState: this.atomNodeV8InspectorView.serialize()
    };
  },

  toggle() {
    console.log('AtomNodeV8Inspector was toggled!');
    return (
      this.modalPanel.isVisible() ?
      this.modalPanel.hide() :
      this.modalPanel.show()
    );
  }

};
