/**
 * Catalog of objects exposed for XDM
 */
var XDMObjectRegistry = /** @class */ (function () {
    function XDMObjectRegistry() {
        this._registeredObjects = {};
    }

    /**
     * Register an object (instance or factory method) exposed by this frame to callers in a remote frame
     *
     * @param instanceId unique id of the registered object
     * @param instance Either: (1) an object instance, or (2) a function that takes optional context data and returns an object instance.
     */
    XDMObjectRegistry.prototype.register = function (instanceId, instance) {
        this._registeredObjects[instanceId] = instance;
    };
    /**
     * Unregister an object (instance or factory method) that was previously registered by this frame
     *
     * @param instanceId unique id of the registered object
     */
    XDMObjectRegistry.prototype.unregister = function (instanceId) {
        delete this._registeredObjects[instanceId];
    };
    /**
     * Get an instance of an object registered with the given id
     *
     * @param instanceId unique id of the registered object
     * @param contextData Optional context data to pass to a registered object's factory method
     */
    XDMObjectRegistry.prototype.getInstance = function (instanceId, contextData) {
        var instance = this._registeredObjects[instanceId];
        if (!instance) {
            return null;
        }
        if (typeof instance === "function") {
            return instance(contextData);
        } else {
            return instance;
        }
    };
    return XDMObjectRegistry;
}());

export default XDMObjectRegistry;
