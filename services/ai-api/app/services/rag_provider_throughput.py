from app.clients.rag_redis_client import RagRedisUnavailable
from app.core.rag_provider_quotas import RagModelQuota


ACQUIRE_WITH_QUOTA_SCRIPT = """
local permits, cooldown, timestamps, weights = KEYS[1], KEYS[2], KEYS[3], KEYS[4]
local id = ARGV[1]
local function integer(value, minimum, maximum)
  local n = tonumber(value)
  if not n or n ~= math.floor(n) or n < minimum or n > maximum then return nil end
  return n
end
local limit = integer(ARGV[2], 1, 32)
local lease = integer(ARGV[3], 15000, 180000)
local incoming = integer(ARGV[4], 0, 1000000)
local outgoing = integer(ARGV[5], 0, 1000000)
local rpm = integer(ARGV[6], 1, 1000)
local tpm = integer(ARGV[7], 1, 100000000)
local itpm = integer(ARGV[8], 0, 100000000)
local otpm = integer(ARGV[9], 0, 100000000)
if not (limit and lease and incoming and outgoing and rpm and tpm and itpm and otpm)
  or #id ~= 36 or not string.match(id, "^[a-f0-9%-]+$")
then return {"unavailable", "0"} end

local clock = redis.call("TIME")
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local cutoff = now - 60000
local size = redis.call("ZCARD", timestamps)
if size > 1000 or size ~= redis.call("HLEN", weights) then return {"unavailable", "0"} end
local entries = redis.call("ZRANGE", timestamps, 0, -1, "WITHSCORES")
local expired = {}
local count, input, output, total = 0, 0, 0, 0
for i = 1, #entries, 2 do
  local member, score = entries[i], tonumber(entries[i + 1])
  local encoded = redis.call("HGET", weights, member)
  if not encoded or score > now then return {"unavailable", "0"} end
  local a, b, c = string.match(encoded, "^(%d+):(%d+):(%d+)$")
  a, b, c = integer(a, 0, 1000000), integer(b, 0, 1000000), integer(c, 0, 2000000)
  if not (a and b and c) or c < a + b then return {"unavailable", "0"} end
  if score <= cutoff then
    table.insert(expired, member)
  else
    if member == id then return {"existing", "0"} end
    count, input, output, total = count + 1, input + a, output + b, total + c
  end
end
if redis.call("EXISTS", cooldown) == 1 then return {"cooldown", "0"} end
if redis.call("ZSCORE", permits, id) then return {"existing", "0"} end
if redis.call("ZCOUNT", permits, "(" .. now, "+inf") >= limit then return {"busy", "0"} end
if count + 1 > rpm then return {"rpm_limited", "0"} end
if total + incoming + outgoing > tpm
  or (itpm > 0 and input + incoming > itpm) or (otpm > 0 and output + outgoing > otpm)
then return {"tpm_limited", "0"} end

if #expired > 0 then
  redis.call("HDEL", weights, unpack(expired))
  redis.call("ZREMRANGEBYSCORE", timestamps, "-inf", cutoff)
end
redis.call("ZREMRANGEBYSCORE", permits, "-inf", now)
redis.call("ZADD", timestamps, now, id)
redis.call("HSET", weights, id, incoming .. ":" .. outgoing .. ":" .. (incoming + outgoing))
redis.call("PEXPIRE", timestamps, 120000)
redis.call("PEXPIRE", weights, 120000)
redis.call("ZADD", permits, now + lease, id)
if redis.call("PTTL", permits) < lease then redis.call("PEXPIRE", permits, lease) end
return {"acquired", id}
"""

SETTLE_DEBT_SCRIPT = """
local id = ARGV[1]
local input, output, total = tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
if not input or not output or not total or input < 0 or input > 1000000 or output < 0
  or output > 1000000 or total < 0 or total > 2000000
  or input ~= math.floor(input) or output ~= math.floor(output) or total ~= math.floor(total)
then return -1 end
local score = redis.call("ZSCORE", KEYS[1], id)
local value = redis.call("HGET", KEYS[2], id)
if not score and not value then return 0 end
if not score or not value then return -1 end
local clock = redis.call("TIME")
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
if tonumber(score) <= now - 60000 then return 0 end
local a, b, c = string.match(value, "^(%d+):(%d+):(%d+)$")
if not (a and b and c) then return -1 end
input, output = math.max(input, tonumber(a)), math.max(output, tonumber(b))
total = math.max(total, tonumber(c), input + output)
redis.call("HSET", KEYS[2], id, input .. ":" .. output .. ":" .. total)
return 1
"""


def quota_arguments(quota: RagModelQuota, input_tokens: int, output_tokens: int):
    if any(type(value) is not int or not 0 <= value <= 1_000_000 for value in (input_tokens, output_tokens)):
        raise RagRedisUnavailable("Invalid RAG quota reservation.")
    return [input_tokens, output_tokens, quota.rpm, quota.tpm, quota.itpm or 0, quota.otpm or 0]
