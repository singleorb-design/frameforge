.DEFAULT_GOAL := dev

.PHONY: kill-3000 dev start storage agent hermes-check

kill-3000:
	@pids=$$(lsof -ti tcp:3000 -sTCP:LISTEN 2>/dev/null); \
	if [ -n "$$pids" ]; then \
		echo "Killing port 3000: $$pids"; \
		kill $$pids; \
		sleep 1; \
	fi

dev: kill-3000
	@LOCAL_STORAGE_TOKEN=$$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"); \
	LOCAL_STORAGE_PORT=17372; \
	export LOCAL_STORAGE_TOKEN LOCAL_STORAGE_PORT; \
	npx tsx local-storage/src/index.ts & storage_pid=$$!; \
	trap 'kill $$storage_pid 2>/dev/null' EXIT INT TERM; \
	node -e "let n=0; const port=process.env.LOCAL_STORAGE_PORT; const wait=()=>fetch('http://127.0.0.1:'+port+'/local-api/health').then(r=>{if(!r.ok) throw 0}).catch(()=>new Promise((resolve,reject)=>setTimeout(()=>++n<50?resolve(wait()):reject(new Error('local storage timeout')),100))); wait()"; \
	cd web && npm run dev

start: kill-3000
	@LOCAL_STORAGE_TOKEN=$$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"); \
	LOCAL_STORAGE_PORT=17372; \
	export LOCAL_STORAGE_TOKEN LOCAL_STORAGE_PORT; \
	npx tsx local-storage/src/index.ts & storage_pid=$$!; \
	cd canvas-agent && npm run dev & agent_pid=$$!; \
	trap 'kill $$storage_pid $$agent_pid 2>/dev/null' EXIT INT TERM; \
	node -e "let n=0; const port=process.env.LOCAL_STORAGE_PORT; const wait=()=>fetch('http://127.0.0.1:'+port+'/local-api/health').then(r=>{if(!r.ok) throw 0}).catch(()=>new Promise((resolve,reject)=>setTimeout(()=>++n<50?resolve(wait()):reject(new Error('local storage timeout')),100))); wait()"; \
	cd web && npm run dev

storage:
	@LOCAL_STORAGE_TOKEN=$$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"); \
	LOCAL_STORAGE_PORT=17372; \
	export LOCAL_STORAGE_TOKEN LOCAL_STORAGE_PORT; \
	npx tsx local-storage/src/index.ts

agent:
	cd canvas-agent && npm run dev

hermes-check:
	hermes acp --check
