Use this dev container to run the project inside a Linux environment on Windows via Docker Desktop with the WSL2 backend.

Recommended setup:

1. Enable WSL2 and install Docker Desktop.
2. In Docker Desktop, enable the WSL2 based engine.
3. Open this repository in VS Code.
4. Run `Dev Containers: Reopen in Container`.
5. Start Postgres on the host: `docker compose -f backend/docker-compose.dev.yml up -d postgres`, and set `DATABASE_URL=postgres://bazarpro:bazarpro@host.docker.internal:55432/bazarpro` in `.env.local`.
6. Inside the container, start the app with `npm run dev:full`, or run the VS Code task `Dev Full` to start the backend and Vite in parallel.
7. Use the launch config `Start App And Open Chrome` if you want VS Code to start the dev tasks and open the app.

Notes:

- For best filesystem performance on Windows, keep the repository inside the WSL filesystem, for example under `/home/<user>/...`, instead of `C:\...`.
- Copy `.env.local` into the container-backed workspace as usual; the container uses the same project files mounted at `/workspace`.
