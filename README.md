# yarnl
> Yet Another Redis NodeJS Lock

A NodeJS library for **single instance** Redis v2.6.12+ locking.

For distributed locking, see http://redis.io/topics/distlock.

## About

Implements the locking algorithm specified in http://redis.io/commands/set.
Locking is implemented with a set-if-not-exists plus a TTL to cull stale locks:

    SET resource-name random-token NX PX max-lock-time

The random token is important to prevent clients from erroneously believing
they hold a lock. `yarnl` uses UUIDs (v1), via
[node-uuid](https://github.com/broofa/node-uuid), for its random tokens.
`node-uuid` uses an
[internal counter](https://github.com/broofa/node-uuid/blob/319dc6e/uuid.js#L131)
to emulate UUIDv1's 100ns precision, so there is little risk of lock collisions
even at high use. The UUID generator is also
[seeded with 128 bytes of cryptographically strong randomness](https://github.com/broofa/node-uuid/blob/319dc6e/uuid.js#L100)
so that separate processes will not collide.

Unlocking is implemented with a Lua script:

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

## Requirements

* Redis `v2.6.12+` for SET NX PX, but only tested on `v2.8`
* [node-redis](https://github.com/mranney/node_redis) `v0.10+`

## Install

    npm install yarnl

## Usage

### Minimum example
```javascript
var Lock = require('yarnl');

new Lock('lockName').lock(function (err, unlock) {
  if (err) { /* handle error... */ }

  if (!unlock) {
    // we didn't get the lock
  } else {
    // do stuff with lock...

    unlock(function (err) {
      if (err) {
        // error releasing lock, not a big deal since we set TTLs
      }
    });
  }
});
```

### Custom backoff strategies
You can create custom backoff strategies by passing a function to `retryDelay`.
This example shows how you might create an exponential backoff with delays
[10, 20, 40, ...].

```javascript
new Lock('expontentialBackoffLock').lock({
  retryDelay: (function () {
    var delay = 5;
    return function () {
      return delay * 2;
    };
  })()
}, function (err, unlock) {
  // etc.
});
```

## Comparison to other libraries

There are a lot of existing [Redis](https://github.com/errorception/redis-lock)
[locking](https://github.com/TheDeveloper/warlock)
[libraries](https://github.com/jeffomatic/redis-exp-lock-js) for NodeJS.
Unfortunately, a lot of the existing libraries are missing useful features,
like automatic retry support. `yarnl` also tries to implement the
[current best practice Redis locking algorithm](http://redis.io/commands/set)
which has changed over the years as Redis has matured.

## API

### `new Lock(name [, options])`

Instantiates a new lock with the given name and optional options. `options` is
an object with the following possible properties:

* `ttl`: How long until the lock is automatically deleted by Redis. Defaults to
 5 seconds. Set this higher if you plan on holding the lock for longer.
* `maxAttempts`: Number of times to attempt to acquire the lock. For example,
 `maxAttempts: 1` will only attempt to acquire the lock once, failing if it is
  unavailable. Defaults to `null`, which will keep trying forever.
* `retryDelay`: Milliseconds to wait between attempts. Has no effect if
 `maxAttempts` equals 1. Defaults to 50ms. Can also be a function (see
 [custom backoff strategies](#custom-backoff-strategies)).
* `client`: [node-redis](https://github.com/mranney/node_redis) client instance
 to use. Defaults to `require('redis').createClient()`.

### `.lock([options, ] callback)`

Acquire the lock. If `options.maxAttempts` isn't set (which is the default),
the callback will not be called until the lock is acquired, or an error occurs.

`callback` is called with a (potentially `null`) error and an `unlock` function.
If we failed to acquire the lock after `maxAttempts` attempts, `unlock` will be
`null`.

This method also takes an optional `options` argument which is an object.
Options passed to `.lock()` will override options passed to the `Lock`
constructor. Besides the constructor options (`ttl`, `maxAttempts`, etc.),
`.lock()` accepts the following additional options:

* `value`: Value to save as the contents of the lock's Redis key. This should be
a random token to prevent accidental deletion by clients that erroneously
believe they hold the lock. Defaults to a UUIDv1.

### `.tryLock(callback)`

Equivalent to `lock({maxAttempts: 1})`

### `.unlock(callback)`

The same unlock function that's passed to `lock()`. Useful if you want to unlock
outside the scope of the `lock` function. Since code passed to the `lock`
function might still be using the lock, this method should be used with caution.
