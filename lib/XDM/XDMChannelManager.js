import XDMChannel from './XDMChannel';
/**
 * Registry of XDM channels kept per target frame/window
 */
var XDMChannelManager = /** @class */ (function () {
    function XDMChannelManager() {
        this._channels = [];
        this._subscribe(window);
    }

    XDMChannelManager.get = function () {
        if (!this._default) {
            this._default = new XDMChannelManager();
        }
        return this._default;
    };
    /**
     * Add an XDM channel for the given target window/iframe
     *
     * @param window Target iframe window to communicate with
     * @param targetOrigin Url of the target iframe (if known)
     */
    XDMChannelManager.prototype.addChannel = function (window, targetOrigin) {
        var channel = new XDMChannel(window, targetOrigin);
        this._channels.push(channel);
        return channel;
    };
    XDMChannelManager.prototype.removeChannel = function (channel) {
        this._channels = this._channels.filter(function (c) {
            return c !== channel;
        });
    };
    XDMChannelManager.prototype._handleMessageReceived = function (event) {
        // get channel and dispatch to it
        var i, len, channel;
        var rpcMessage;
        if (typeof event.data === "string") {
            try {
                rpcMessage = JSON.parse(event.data);
            } catch (error) {
                // The message is not a valid JSON string. Not one of our events.
            }
        }
        if (rpcMessage) {
            var handled = false;
            var channelOwner;
            for (i = 0, len = this._channels.length; i < len; i++) {
                channel = this._channels[i];
                if (channel.owns(event.source, event.origin, rpcMessage)) {
                    // keep a reference to the channel owner found.
                    channelOwner = channel;
                    handled = channel.onMessage(rpcMessage, event.origin) || handled;
                }
            }
            if (!!channelOwner && !handled) {
                if (window.console) {
                    console.error("No handler found on any channel for message: " + JSON.stringify(rpcMessage));
                }
                // for instance based proxies, send an error on the channel owning the message to resolve any control creation promises
                // on the host frame.
                if (rpcMessage.instanceId) {
                    channelOwner.error(rpcMessage, "The registered object " + rpcMessage.instanceId + " could not be found.");
                }
            }
        }
    };
    XDMChannelManager.prototype._subscribe = function (windowObj) {
        var _this = this;
        if (windowObj.addEventListener) {
            windowObj.addEventListener("message", function (event) {
                _this._handleMessageReceived(event);
            });
        } else {
            // IE8
            windowObj.attachEvent("onmessage", function (event) {
                _this._handleMessageReceived(event);
            });
        }
    };
    return XDMChannelManager;
}());
export default XDMChannelManager;
