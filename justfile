default: build

build:
  rm -rf dist/*
  npm run build

test: build
  npm run test

format:
  npm run format
