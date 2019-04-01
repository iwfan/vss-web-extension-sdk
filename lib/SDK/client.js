class Client {

    _msgChannel
    promiseQueue = {};

    init() {
        window.setTimeout(() => {
            this._msgChannel = new MessageChannel();
            window.parent.postMessage('initialHandShack', '*', [this._msgChannel.port2])
        })
    }


    _handleMessageReceived(event) {
        this.promiseQueue[event.id]
    }

    _subscribe() {
        this._msgChannel.port1.start();
        this._msgChannel.port1.addEventListener('message', this._handleMessageReceived);
    }

    _notify(message) {
        return new Promise((resolve, reject) => {
            this.promiseQueue['1'] = [resolve, reject];
            this._msgChannel.port1.postMessage(message);
        })
    }
}
