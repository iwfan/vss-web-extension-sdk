/**
 * Represents a channel of communication between frames\document
 * Stays "alive" across multiple funtion\method calls
 */
var XDMChannel = /** @class */ (function () {
    function XDMChannel(postToWindow, targetOrigin) {
        if (targetOrigin === void 0) {
            targetOrigin = null;
        }
        this._nextMessageId = 1;
        this._deferreds = {};
        this._nextProxyFunctionId = 1;
        this._proxyFunctions = {};
        this._postToWindow = postToWindow;
        this._targetOrigin = targetOrigin;
        this._channelObjectRegistry = new XDMObjectRegistry();
        this._channelId = XDMChannel._nextChannelId++;
        if (!this._targetOrigin) {
            this._handshakeToken = newFingerprint();
        }
    }

    /**
     * Get the object registry to handle messages from this specific channel.
     * Upon receiving a message, this channel registry will be used first, then
     * the global registry will be used if no handler is found here.
     */
    XDMChannel.prototype.getObjectRegistry = function () {
        return this._channelObjectRegistry;
    };
    /**
     * Invoke a method via RPC. Lookup the registered object on the remote end of the channel and invoke the specified method.
     *
     * @param method Name of the method to invoke
     * @param instanceId unique id of the registered object
     * @param params Arguments to the method to invoke
     * @param instanceContextData Optional context data to pass to a registered object's factory method
     * @param serializationSettings Optional serialization settings
     */
    XDMChannel.prototype.invokeRemoteMethod = function (methodName, instanceId, params, instanceContextData, serializationSettings) {
        var message = {
            id: this._nextMessageId++,
            methodName: methodName,
            instanceId: instanceId,
            instanceContext: instanceContextData,
            params: this._customSerializeObject(params, serializationSettings),
            jsonrpc: "2.0",
            serializationSettings: serializationSettings
        };
        if (!this._targetOrigin) {
            message.handshakeToken = this._handshakeToken;
        }
        var deferred = createDeferred();
        this._deferreds[message.id] = deferred;
        this._sendRpcMessage(message);
        return deferred.promise;
    };
    /**
     * Get a proxied object that represents the object registered with the given instance id on the remote side of this channel.
     *
     * @param instanceId unique id of the registered object
     * @param contextData Optional context data to pass to a registered object's factory method
     */
    XDMChannel.prototype.getRemoteObjectProxy = function (instanceId, contextData) {
        return this.invokeRemoteMethod(null, instanceId, null, contextData);
    };
    XDMChannel.prototype.invokeMethod = function (registeredInstance, rpcMessage) {
        var _this = this;
        if (!rpcMessage.methodName) {
            // Null/empty method name indicates to return the registered object itself.
            this._success(rpcMessage, registeredInstance, rpcMessage.handshakeToken);
            return;
        }
        var method = registeredInstance[rpcMessage.methodName];
        if (typeof method !== "function") {
            this._error(rpcMessage, new Error("RPC method not found: " + rpcMessage.methodName), rpcMessage.handshakeToken);
            return;
        }
        try {
            // Call specified method.  Add nested success and error call backs with closure
            // so we can post back a response as a result or error as appropriate
            var methodArgs = [];
            if (rpcMessage.params) {
                methodArgs = this._customDeserializeObject(rpcMessage.params);
            }
            var result = method.apply(registeredInstance, methodArgs);
            if (result && result.then && typeof result.then === "function") {
                result.then(function (asyncResult) {
                    _this._success(rpcMessage, asyncResult, rpcMessage.handshakeToken);
                }, function (e) {
                    _this._error(rpcMessage, e, rpcMessage.handshakeToken);
                });
            } else {
                this._success(rpcMessage, result, rpcMessage.handshakeToken);
            }
        } catch (exception) {
            // send back as error if an exception is thrown
            this._error(rpcMessage, exception, rpcMessage.handshakeToken);
        }
    };
    XDMChannel.prototype.getRegisteredObject = function (instanceId, instanceContext) {
        if (instanceId === "__proxyFunctions") {
            // Special case for proxied functions of remote instances
            return this._proxyFunctions;
        }
        // Look in the channel registry first
        var registeredObject = this._channelObjectRegistry.getInstance(instanceId, instanceContext);
        if (!registeredObject) {
            // Look in the global registry as a fallback
            registeredObject = XDM.globalObjectRegistry.getInstance(instanceId, instanceContext);
        }
        return registeredObject;
    };
    /**
     * Handle a received message on this channel. Dispatch to the appropriate object found via object registry
     *
     * @param data Message data
     * @param origin Origin of the frame that sent the message
     * @return True if the message was handled by this channel. Otherwise false.
     */
    XDMChannel.prototype.onMessage = function (data, origin) {
        var _this = this;
        var rpcMessage = data;
        if (rpcMessage.instanceId) {
            // Find the object that handles this requestNeed to find implementation
            // Look in the channel registry first
            var registeredObject = this.getRegisteredObject(rpcMessage.instanceId, rpcMessage.instanceContext);
            if (!registeredObject) {
                // If not found return false to indicate that the message was not handled
                return false;
            }
            if (typeof registeredObject["then"] === "function") {
                registeredObject.then(function (resolvedInstance) {
                    _this.invokeMethod(resolvedInstance, rpcMessage);
                }, function (e) {
                    _this._error(rpcMessage, e, rpcMessage.handshakeToken);
                });
            } else {
                this.invokeMethod(registeredObject, rpcMessage);
            }
        } else {
            // response
            // Responses look like this -
            //  {"jsonrpc": "2.0", "result": ["hello", 5], "id": "9"}
            //  {"jsonrpc": "2.0", "error": {"code": -32601, "message": "Method not found."}, "id": "5"}
            var deferred = this._deferreds[rpcMessage.id];
            if (!deferred) {
                // Message not handled by this channel.
                return false;
            }
            if (rpcMessage.error) {
                deferred.reject(this._customDeserializeObject([rpcMessage.error])[0]);
            } else {
                deferred.resolve(this._customDeserializeObject([rpcMessage.result])[0]);
            }
            delete this._deferreds[rpcMessage.id];
        }
        // Message handled by this channel
        return true;
    };
    XDMChannel.prototype.owns = function (source, origin, data) {
        /// Determines whether the current message belongs to this channel or not
        var rpcMessage = data;
        if (this._postToWindow === source) {
            // For messages coming from sandboxed iframes the origin will be set to the string "null".  This is
            // how onprem works.  If it is not a sandboxed iFrame we will get the origin as expected.
            if (this._targetOrigin) {
                if (origin) {
                    return origin.toLowerCase() === "null" || this._targetOrigin.toLowerCase().indexOf(origin.toLowerCase()) === 0;
                } else {
                    return false;
                }
            } else {
                if (rpcMessage.handshakeToken && rpcMessage.handshakeToken === this._handshakeToken) {
                    this._targetOrigin = origin;
                    return true;
                }
            }
        }
        return false;
    };
    XDMChannel.prototype.error = function (data, errorObj) {
        var rpcMessage = data;
        this._error(rpcMessage, errorObj, rpcMessage.handshakeToken);
    };
    XDMChannel.prototype._error = function (messageObj, errorObj, handshakeToken) {
        // Post back a response as an error which look like this -
        //  {"id": "5", "error": {"code": -32601, "message": "Method not found."}, "jsonrpc": "2.0", }
        var message = {
            id: messageObj.id,
            error: this._customSerializeObject([errorObj], messageObj.serializationSettings)[0],
            jsonrpc: "2.0",
            handshakeToken: handshakeToken
        };
        this._sendRpcMessage(message);
    };
    XDMChannel.prototype._success = function (messageObj, result, handshakeToken) {
        // Post back response result which look like this -
        //  {"id": "9", "result": ["hello", 5], "jsonrpc": "2.0"}
        var message = {
            id: messageObj.id,
            result: this._customSerializeObject([result], messageObj.serializationSettings)[0],
            jsonrpc: "2.0",
            handshakeToken: handshakeToken
        };
        this._sendRpcMessage(message);
    };
    XDMChannel.prototype._sendRpcMessage = function (message) {
        var messageString = JSON.stringify(message);
        this._postToWindow.postMessage(messageString, "*");
    };
    XDMChannel.prototype._shouldSkipSerialization = function (obj) {
        for (var i = 0, l = XDMChannel.WINDOW_TYPES_TO_SKIP_SERIALIZATION.length; i < l; i++) {
            var instanceType = XDMChannel.WINDOW_TYPES_TO_SKIP_SERIALIZATION[i];
            if (window[instanceType] && obj instanceof window[instanceType]) {
                return true;
            }
        }
        if (window.jQuery) {
            for (var i = 0, l = XDMChannel.JQUERY_TYPES_TO_SKIP_SERIALIZATION.length; i < l; i++) {
                var instanceType = XDMChannel.JQUERY_TYPES_TO_SKIP_SERIALIZATION[i];
                if (window.jQuery[instanceType] && obj instanceof window.jQuery[instanceType]) {
                    return true;
                }
            }
        }
        return false;
    };
    XDMChannel.prototype._customSerializeObject = function (obj, settings, parentObjects, nextCircularRefId, depth) {
        var _this = this;
        if (parentObjects === void 0) {
            parentObjects = null;
        }
        if (nextCircularRefId === void 0) {
            nextCircularRefId = 1;
        }
        if (depth === void 0) {
            depth = 1;
        }
        if (!obj || depth > XDMChannel.MAX_XDM_DEPTH) {
            return null;
        }
        if (this._shouldSkipSerialization(obj)) {
            return null;
        }
        var serializeMember = function (parentObject, newObject, key) {
            var item;
            try {
                item = parentObject[key];
            } catch (ex) {
                // Cannot access this property. Skip its serialization.
            }
            var itemType = typeof item;
            if (itemType === "undefined") {
                return;
            }
            // Check for a circular reference by looking at parent objects
            var parentItemIndex = -1;
            if (itemType === "object") {
                parentItemIndex = parentObjects.originalObjects.indexOf(item);
            }
            if (parentItemIndex >= 0) {
                // Circular reference found. Add reference to parent
                var parentItem = parentObjects.newObjects[parentItemIndex];
                if (!parentItem.__circularReferenceId) {
                    parentItem.__circularReferenceId = nextCircularRefId++;
                }
                newObject[key] = {
                    __circularReference: parentItem.__circularReferenceId
                };
            } else {
                if (itemType === "function") {
                    var proxyFunctionId = _this._nextProxyFunctionId++;
                    newObject[key] = {
                        __proxyFunctionId: _this._registerProxyFunction(item, obj),
                        __channelId: _this._channelId
                    };
                } else if (itemType === "object") {
                    if (item && item instanceof Date) {
                        newObject[key] = {
                            __proxyDate: item.getTime()
                        };
                    } else {
                        newObject[key] = _this._customSerializeObject(item, settings, parentObjects, nextCircularRefId, depth + 1);
                    }
                } else if (key !== "__proxyFunctionId") {
                    // Just add non object/function properties as-is. Don't include "__proxyFunctionId" to protect
                    // our proxy methods from being invoked from other messages.
                    newObject[key] = item;
                }
            }
        };
        var returnValue;
        if (!parentObjects) {
            parentObjects = {
                newObjects: [],
                originalObjects: []
            };
        }
        parentObjects.originalObjects.push(obj);
        if (obj instanceof Array) {
            returnValue = [];
            parentObjects.newObjects.push(returnValue);
            for (var i = 0, l = obj.length; i < l; i++) {
                serializeMember(obj, returnValue, i);
            }
        } else {
            returnValue = {};
            parentObjects.newObjects.push(returnValue);
            var keys = {};
            try {
                // We want to get both enumerable and non-enumerable properties
                // including inherited enumerable properties. for..in grabs
                // enumerable properties (including inherited properties) and
                // getOwnPropertyNames includes non-enumerable properties.
                // Merge these results together.
                for (var key in obj) {
                    keys[key] = true;
                }
                var ownProperties = Object.getOwnPropertyNames(obj);
                for (var i = 0, l = ownProperties.length; i < l; i++) {
                    keys[ownProperties[i]] = true;
                }
            } catch (ex) {
                // We may not be able to access the iterator of this object. Skip its serialization.
            }
            for (var key in keys) {
                // Don't serialize properties that start with an underscore.
                if ((key && key[0] !== "_") || (settings && settings.includeUnderscoreProperties)) {
                    serializeMember(obj, returnValue, key);
                }
            }
        }
        parentObjects.originalObjects.pop();
        parentObjects.newObjects.pop();
        return returnValue;
    };
    XDMChannel.prototype._registerProxyFunction = function (func, context) {
        var proxyFunctionId = this._nextProxyFunctionId++;
        this._proxyFunctions["proxy" + proxyFunctionId] = function () {
            return func.apply(context, Array.prototype.slice.call(arguments, 0));
        };
        return proxyFunctionId;
    };
    XDMChannel.prototype._customDeserializeObject = function (obj, circularRefs) {
        var _this = this;
        var that = this;
        if (!obj) {
            return null;
        }
        if (!circularRefs) {
            circularRefs = {};
        }
        var deserializeMember = function (parentObject, key) {
            var item = parentObject[key];
            var itemType = typeof item;
            if (key === "__circularReferenceId" && itemType === 'number') {
                circularRefs[item] = parentObject;
                delete parentObject[key];
            } else if (itemType === "object" && item) {
                if (item.__proxyFunctionId) {
                    parentObject[key] = function () {
                        return that.invokeRemoteMethod("proxy" + item.__proxyFunctionId, "__proxyFunctions", Array.prototype.slice.call(arguments, 0), null, {includeUnderscoreProperties: true});
                    };
                } else if (item.__proxyDate) {
                    parentObject[key] = new Date(item.__proxyDate);
                } else if (item.__circularReference) {
                    parentObject[key] = circularRefs[item.__circularReference];
                } else {
                    _this._customDeserializeObject(item, circularRefs);
                }
            }
        };
        if (obj instanceof Array) {
            for (var i = 0, l = obj.length; i < l; i++) {
                deserializeMember(obj, i);
            }
        } else if (typeof obj === "object") {
            for (var key in obj) {
                deserializeMember(obj, key);
            }
        }
        return obj;
    };
    XDMChannel._nextChannelId = 1;
    XDMChannel.MAX_XDM_DEPTH = 100;
    XDMChannel.WINDOW_TYPES_TO_SKIP_SERIALIZATION = [
        "Node",
        "Window",
        "Event"
    ];
    XDMChannel.JQUERY_TYPES_TO_SKIP_SERIALIZATION = [
        "jQuery"
    ];
    return XDMChannel;
}());

export default XDMChannel;
