default: build

build:
  rm -rf dist/*
  npm run build

test: build
  npm run test

lint:
  npm run lint

format:
  npm run format
  cd src/vt && cargo fmt
