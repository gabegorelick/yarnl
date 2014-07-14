--
-- Implement unlocking by deleting a key if content is equal to specified value.
-- Inspired by the single instance version of http://redis.io/topics/distlock
--
-- KEYS[1] - lock name
-- ARGV[1] - lock content

if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
