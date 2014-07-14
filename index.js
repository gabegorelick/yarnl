'use strict';

var _ = require('lodash');

var redis = require('redis');
var redisWarlock = require('node-redis-warlock');

function Lock (name, options) {
  if (!(this instanceof Lock)) {
    return new Lock(name, options);
  }

  if (!name || ! _.isString(name)) {
    throw new Error('Lock name not specified');
  }

  this.name = name;
  this.options = _.assign({
    ttl: 5000, // redis-lock's default
    retryDelay: 50, // redis-lock's default
    maxAttempts: null // keep trying forever
  }, options);

  var client = this.options.client || redis.createClient();

  // TODO we might want to use our own locking code, see https://github.com/TheDeveloper/warlock/issues/3
  this.warlock = redisWarlock(client);

  /**
   * Key in Redis this lock lives in
   */
  this.key = this.warlock.makeKey(this.name);
}

Lock.prototype.lock = function lock (options, callback) {
  if (!callback) {
    callback = arguments[0];
    options = null;
  }

  options = _.assign({}, this.options, options);

  var attempts = 0;
  var doLock = function () {
    attempts++;

    // we always try to acquire the lock first and then check maxAttempts, since there's no point setting maxAttempts
    // equal to 0
    this.warlock.lock(this.name, options.ttl, function (err, unlock) {
      if (err) {
        return callback(err);
      }

      if (!unlock) {
        if (options.maxAttempts && options.maxAttempts <= attempts) {
          return callback(null, false);
        }

        // try again later
        setTimeout(doLock, options.retryDelay);
      } else {
        // we got the lock

        this.unlock = unlock; // override Lock.prototype.unlock

        callback(null, unlock);
      }
    }.bind(this));
  }.bind(this);

  doLock();
};

Lock.prototype.tryLock = function tryLock (options, callback) {
  options = _.assign({maxAttempts: 1});
  return this.lock(options, callback);
};

/**
 * The same unlock function that's passed to `lock`. Useful if you want to unlock outside the scope of the `lock`
 * function. Since code passed to the `lock` function might still be using the lock, this method should be used with
 * caution.
 */
Lock.prototype.unlock = function (callback) {
  // This method is overridden when we lock. If this function got called, it means we don't hold the lock.
  process.nextTick(callback);
};

module.exports = Lock;
