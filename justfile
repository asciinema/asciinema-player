default: build

build:
  rm -rf dist/*
  npm run build

test:
  npm run test

format:
  npm run format
