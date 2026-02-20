#!/bin/bash

# This uses Docker but works fine with Podman too (I primarily use Podman).

# Load DATABASE_URL from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep DATABASE_URL | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Parse DATABASE_URL (format: postgresql://user:password@host:port/database)
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

docker run --name kite-postgres \
        -e POSTGRES_USER=${DB_USER} \
        -e POSTGRES_PASSWORD=${DB_PASSWORD} \
        -e POSTGRES_DB=${DB_NAME} \
        -p ${DB_PORT}:5432 \
        -d postgres:16-alpine
