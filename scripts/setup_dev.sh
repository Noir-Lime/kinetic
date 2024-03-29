DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

docker compose -f $DIR/../docker/docker.compose.yml up -d --remove-orphans db
$DIR/wait-for-it.sh "localhost:$DB_PORT" -- echo "Postgres is up at localhost:$DB_PORT"