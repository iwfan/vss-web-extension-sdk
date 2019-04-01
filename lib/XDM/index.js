import XDMChannel from './XDMChannel';
import XDMChannelManager from './XDMChannelManager';
import XDMObjectRegistry from './XDMObjectRegistry';
var XDM;
(function (XDM) {
    /**
     * Create a new deferred object
     */
    function createDeferred() {
        return new XdmDeferred();
    }

    XDM.createDeferred = createDeferred;
    var XdmDeferred = /** @class */ (function () {
        function XdmDeferred() {
            var _this = this;
            this._resolveCallbacks = [];
            this._rejectCallbacks = [];
            this._isResolved = false;
            this._isRejected = false;
            this.resolve = function (result) {
                _this._resolve(result);
            };
            this.reject = function (reason) {
                _this._reject(reason);
            };
            this.promise = {};
            this.promise.then = function (onFulfill, onReject) {
                return _this._then(onFulfill, onReject);
            };
        }

        XdmDeferred.prototype._then = function (onFulfill, onReject) {
            var _this = this;
            if ((!onFulfill && !onReject) ||
                (this._isResolved && !onFulfill) ||
                (this._isRejected && !onReject)) {
                return this.promise;
            }
            var newDeferred = new XdmDeferred();
            this._resolveCallbacks.push(function (value) {
                _this._wrapCallback(onFulfill, value, newDeferred, false);
            });
            this._rejectCallbacks.push(function (reason) {
                _this._wrapCallback(onReject, reason, newDeferred, true);
            });
            if (this._isResolved) {
                this._resolve(this._resolvedValue);
            } else if (this._isRejected) {
                this._reject(this._rejectValue);
            }
            return newDeferred.promise;
        };
        XdmDeferred.prototype._wrapCallback = function (callback, value, deferred, reject) {
            if (!callback) {
                if (reject) {
                    deferred.reject(value);
                } else {
                    deferred.resolve(value);
                }
                return;
            }
            var result;
            try {
                result = callback(value);
            } catch (ex) {
                deferred.reject(ex);
                return;
            }
            if (result === undefined) {
                deferred.resolve(value);
            } else if (result && typeof result.then === "function") {
                result.then(function (innerResult) {
                    deferred.resolve(innerResult);
                }, function (innerReason) {
                    deferred.reject(innerReason);
                });
            } else {
                deferred.resolve(result);
            }
        };
        XdmDeferred.prototype._resolve = function (result) {
            if (!this._isRejected && !this._isResolved) {
                this._isResolved = true;
                this._resolvedValue = result;
            }
            if (this._isResolved && this._resolveCallbacks.length > 0) {
                var resolveCallbacks = this._resolveCallbacks.splice(0);
                // 2.2.4. #onFulfilled or onRejected must not be called until the execution context stack contains only platform code.
                window.setTimeout(function () {
                    for (var i = 0, l = resolveCallbacks.length; i < l; i++) {
                        resolveCallbacks[i](result);
                    }
                });
            }
        };
        XdmDeferred.prototype._reject = function (reason) {
            if (!this._isRejected && !this._isResolved) {
                this._isRejected = true;
                this._rejectValue = reason;
                if (this._rejectCallbacks.length === 0 && window.console && window.console.warn) {
                    console.warn("Rejected XDM promise with no reject callbacks");
                    if (reason) {
                        console.warn(reason);
                    }
                }
            }
            if (this._isRejected && this._rejectCallbacks.length > 0) {
                var rejectCallbacks = this._rejectCallbacks.splice(0);
                // 2.2.4. #onFulfilled or onRejected must not be called until the execution context stack contains only platform code.
                window.setTimeout(function () {
                    for (var i = 0, l = rejectCallbacks.length; i < l; i++) {
                        rejectCallbacks[i](reason);
                    }
                });
            }
        };
        return XdmDeferred;
    }());
    var smallestRandom = parseInt("10000000000", 36);
    var maxSafeInteger = Number.MAX_SAFE_INTEGER || 9007199254740991;

    /**
     * Create a new random 22-character fingerprint.
     * @return string fingerprint
     */
    function newFingerprint() {
        // smallestRandom ensures we will get a 11-character result from the base-36 conversion.
        return Math.floor((Math.random() * (maxSafeInteger - smallestRandom)) + smallestRandom).toString(36) +
            Math.floor((Math.random() * (maxSafeInteger - smallestRandom)) + smallestRandom).toString(36);
    }

    XDM.XDMObjectRegistry = XDMObjectRegistry;
    ;
    /**
     * The registry of global XDM handlers
     */
    XDM.globalObjectRegistry = new XDMObjectRegistry();

    XDM.XDMChannel = XDMChannel;

    XDM.XDMChannelManager = XDMChannelManager;
})(XDM || (XDM = {}));
