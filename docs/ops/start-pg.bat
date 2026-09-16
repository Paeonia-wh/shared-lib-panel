@echo off
rem Start the platform PostgreSQL on port 55440.
rem
rem DO NOT quote the -o value here. cmd.exe strips the quotes before pg_ctl sees
rem them, so pg_ctl receives "-o -p 55440" and treats the bare 55440 as an extra
rem argument:
rem     pg_ctl: too many command-line arguments (first is "55440")
rem That is exactly what filled pg-silent.err.log on 2026-09-14 23:32 and made
rem every silent attempt fail while the machine looked healthy.
rem -p belongs on the pg_ctl command line (not inside -o), and -l captures the
rem server log so failures are never invisible.
"D:\codex\.runtimes\kstage-postgres\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe" start -D "D:\codex-memory\pgdata" -p 55440 -l "D:\codex-memory\logs\postgres.log" -w > "D:\codex-memory\logs\pg-start.log" 2>&1