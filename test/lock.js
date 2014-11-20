'use strict';

var expect = require('chai').expect;
var client = require('redis').createClient(process.env.REDIS_PORT, process.env.REDIS_HOSTNAME, {
  'auth_pass': process.env.REDIS_PASSWORD
});

var Lock = require('..');

describe('lock', function () {
  var lock = new Lock('test:lock', {client: client});

  afterEach(function (done) {
    return client.del(lock.key, done);
  });

  after(function () {
    client.unref();
  });

  describe('.lock()', function () {
    it('should set redis key', function (done) {
      lock.lock(function (err, unlock) {
        if (err) {
          return done(err);
        }

        expect(unlock).to.be.ok;

        client.get(lock.key, function (err, result) {
          if (err) {
            return done(err);
          }

          expect(result).to.exist; // result is some random value

          done();
        });
      });
    });

    it('should return false if it could not set key', function (done) {
      lock.lock({ttl: 50}, function (err, unlock) {
        if (err) {
          return done(err);
        }

        expect(unlock).to.be.ok;

        lock.lock({maxAttempts: 1}, function (err, unlock) {
          if (err) {
            return done(err);
          }

          expect(unlock).to.not.be.ok;

          done();
        });
      });
    });

    it('should expire locks', function (done) {
      var ttl = 1;
      lock.lock({ttl: ttl}, function (err, unlock) {
        if (err) {
          return done(err);
        }

        expect(unlock).to.be.ok;

        setTimeout(function () {
          client.get(lock.key, function (err, result) {
            if (err) {
              return done(err);
            }

            expect(result).to.not.exist;

            done();
          });
        }, ttl + 1);
      });
    });

    it('should retry if lock not available', function (done) {
      var ttl = 50;
      lock.lock({ttl: ttl}, function (err, unlock) {
        if (err) {
          return done(err);
        }

        expect(unlock).to.be.ok;

        lock.lock({maxAttempts: 2, retryDelay: ttl + 1}, function (err, unlock) {
          if (err) {
            return done(err);
          }

          expect(unlock).to.be.ok;

          done();
        });
      });
    });

    it('should support specifying retryDelay as function', function (done) {
      lock.lock(function (err, unlock) {
        if (err) {
          return done(err);
        }

        expect(unlock).to.be.ok;

        var called = 0;
        lock.lock({
          retryDelay: function () {
            called++;
            unlock();
            return called * 10;
          }
        }, function (err, unlock) {
          if (err) {
            return done(err);
          }

          expect(unlock).to.be.ok;
          expect(called).to.equal(1);

          done();
        });
      });
    });
  });

  describe('unlock callback', function () {
    it('should delete redis key', function (done) {
      lock.lock(function (err, unlock) {
        if (err) {
          return done(err);
        }

        unlock(function (err) {
          if (err) {
            return done(err);
          }

          client.get(lock.key, function (err, result) {
            if (err) {
              return done(err);
            }

            expect(result).to.not.exist;

            done();
          });
        });
      });
    });
  });

  describe('.unlock()', function () {
    it('should delete redis key', function (done) {
      lock.lock(function (err) {
        if (err) {
          return done(err);
        }

        lock.unlock(function (err) {
          if (err) {
            return done(err);
          }

          client.get(lock.key, function (err, result) {
            if (err) {
              return done(err);
            }

            expect(result).to.not.exist;

            done();
          });
        });
      });
    });
  });
});
