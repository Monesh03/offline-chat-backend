import asyncio
import aiohttp
import random
import datetime
import socket

# ---------------------- Inputs ----------------------
API_BASE_URL = input("Enter API Base URL (default http://localhost:8000): ") or "http://localhost:8000"
BACKEND_LOG_URL = f"{API_BASE_URL}/api/log-performance"

user_count = input("Enter number of users (default 50): ")
user_count = int(user_count) if user_count.strip() else 50

iterations = input("Enter number of iterations per user (default 5): ")
iterations = int(iterations) if iterations.strip() else 5

# ---------------------- Helpers ----------------------
def get_machine_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

MACHINE_IP = get_machine_ip()

def trace_headers(user_ip=None):
    ip = user_ip or MACHINE_IP
    return {
        "X-Trace-IP": ip,
        "X-Trace-Timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "User-Agent": "AsyncLoadTester/1.0"
    }

async def log_request(session, endpoint, method, start_time, status, user_agent="AsyncLoadTester/1.0"):
    elapsed_ms = (datetime.datetime.now() - start_time).total_seconds() * 1000
    payload = {
        "endpoint": endpoint,
        "method": method,
        "response_time": elapsed_ms,
        "ip": MACHINE_IP,
        "user_agent": user_agent,
        "status": status
    }
    try:
        await session.post(BACKEND_LOG_URL, json=payload)
    except Exception as e:
        print("⚠️ Failed to send log:", e)

# ---------------------- Simulated User ----------------------
async def simulate_user(user_num: int, iterations: int):
    async with aiohttp.ClientSession() as session:
        identifier = f"asyncuser{random.randint(1000,9999)}@test.com"
        password = "test123"
        uid = None

        for it in range(1, iterations + 1):
            try:
                print(f"[User {user_num} | Iteration {it}] ➡️ Registering {identifier}")
                start = datetime.datetime.now()
                resp = await session.post(
                    f"{API_BASE_URL}/api/auth/register",
                    json={"name": "Async Test", "identifier": identifier, "password": password},
                    headers=trace_headers()
                )
                await log_request(session, "/api/auth/register", "POST", start, resp.status)
                print(f"[User {user_num} | Iteration {it}] ✅ /api/auth/register -> {resp.status}")

                print(f"[User {user_num} | Iteration {it}] ➡️ Logging in as {identifier}")
                start = datetime.datetime.now()
                resp = await session.post(
                    f"{API_BASE_URL}/api/auth/login",
                    json={"identifier": identifier, "password": password},
                    headers=trace_headers()
                )
                await log_request(session, "/api/auth/login", "POST", start, resp.status)
                print(f"[User {user_num} | Iteration {it}] ✅ /api/auth/login -> {resp.status}")

                if resp.status == 200:
                    try:
                        data = await resp.json()
                        uid = data.get("user", {}).get("id") 
                        print(f"[User {user_num} | Iteration {it}] 🔑 Logged in as ID {uid}")
                    except Exception:
                        uid = None

                if uid:
                    # Fetch users
                    print(f"[User {user_num} | Iteration {it}] ➡️ Fetching /users")
                    start = datetime.datetime.now()
                    resp = await session.get(f"{API_BASE_URL}/users", headers=trace_headers())
                    await log_request(session, "/users", "GET", start, resp.status)
                    print(f"[User {user_num} | Iteration {it}] ✅ /users -> {resp.status}")

                    # Fetch groups
                    print(f"[User {user_num} | Iteration {it}] ➡️ Fetching /groups/{uid}")
                    start = datetime.datetime.now()
                    resp = await session.get(f"{API_BASE_URL}/groups/{uid}", headers=trace_headers())
                    await log_request(session, "/groups/{id}", "GET", start, resp.status)
                    print(f"[User {user_num} | Iteration {it}] ✅ /groups/{uid} -> {resp.status}")

                    # Send group message
                    print(f"[User {user_num} | Iteration {it}] ➡️ Sending /group-messages")
                    start = datetime.datetime.now()
                    resp = await session.post(
                        f"{API_BASE_URL}/group-messages",
                        json={
                            "groupId": 1,
                            "from": uid,
                            "text": "Hello from asyncio!",
                            "attachment_url": None,
                            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        },
                        headers=trace_headers()
                    )
                    await log_request(session, "/group-messages", "POST", start, resp.status)
                    print(f"[User {user_num} | Iteration {it}] ✅ /group-messages -> {resp.status}")

                # Sleep between iterations
                sleep_time = random.randint(1, 3)
                print(f"[User {user_num} | Iteration {it}] ⏸ Sleeping {sleep_time}s before next iteration")
                await asyncio.sleep(sleep_time)

            except Exception as e:
                print(f"[User {user_num} | Iteration {it}] ⚠️ Error: {e}")
                await asyncio.sleep(2)

        print(f"[User {user_num}] ✅ Finished all {iterations} iterations")

# ---------------------- Main ----------------------
async def main():
    print(f"🚀 Starting load test with {user_count} users, {iterations} iterations each, against {API_BASE_URL}")
    tasks = [simulate_user(i, iterations) for i in range(1, user_count + 1)]
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())
