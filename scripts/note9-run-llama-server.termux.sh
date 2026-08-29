#!/system/bin/sh
export LD_LIBRARY_PATH=/data/local/tmp/grz/lib:/data/local/tmp/grz/bin:${LD_LIBRARY_PATH}
cd /data/local/tmp/grz
exec /data/local/tmp/grz/bin/llama-server "$@"
