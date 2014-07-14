'use strict';

var crypto = require('crypto');
var _ = require('lodash');
var redis = require('redis');
var uuid = require('node-uuid');
var Scripto = require('redis-scripto');
var luaUnlock = require('fs').readFileSync(__dirname + '/unlock.lua', {encoding: 'utf8'});

function Lock (name, options) {
  if (!(this instanceof Lock)) {
    return new Lock(name, options);
  }

  if (!name || ! _.isString(name)) {
    throw new Error('Lock name not specified');
  }

  this.name = name;

  // not totally sure why we need this, but https://github.com/TheDeveloper/warlock does it
  this.key = 'lock:' + crypto.createHash('sha1').update(this.name).digest('hex').substr(0, 10);

  this.options = _.assign({
    ttl: 5000, // redis-lock's default
    retryDelay: 50, // redis-lock's default
    maxAttempts: null // keep trying forever
  }, options);

  this.client = this.options.client || redis.createClient();
  this.scriptManager = this.options.scriptManager || new Scripto(this.client);
  this.scriptManager.load({
    unlock: luaUnlock
  });
}

Lock.prototype.lock = function lock (options, callback) {
  if (!callback) {
    callback = arguments[0];
    options = null;
  }

  options = _.assign({}, this.options, options);

  var lock = this;
  var attempts = 0;
  var doLock = function () {
    attempts++;

    // we always try to acquire the lock first and then check maxAttempts, since there's no point setting maxAttempts
    // equal to 0
    var value = options.value || uuid.v1();
    lock.client.set(lock.key, value, 'NX', 'PX', options.ttl, function (err, locked) {
      if (err) {
        return callback(err);
      }

      if (!locked) {
        if (options.maxAttempts && options.maxAttempts <= attempts) {
          return callback(null, false);
        }

        // try again later
        setTimeout(doLock, options.retryDelay);
      } else {
        // we got the lock

        lock.unlock = function unlock (callback) { // override Lock.prototype.unlock
          lock.scriptManager.run('unlock', [lock.key], [value], callback);
        };

        callback(null, lock.unlock);
      }
    });
  };

  doLock();
};

Lock.prototype.tryLock = function tryLock (options, callback) {
  options = _.assign({maxAttempts: 1}, options);
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
