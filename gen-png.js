#!/usr/bin/env phantomjs

var system = require('system');
var fs = require('fs');

if (system.args.length < 4) {
  console.log("usage: " + system.args[0] + " <asciicast-url> <image-path> <poster> <scale>");
  console.log("   ex: " + system.args[0] + " demo.json shot.png npt:10 2");
  exit(1);
}

var pageUrl = "gen-png.html";
var jsonUrl = system.args[1];
var imagePath = system.args[2];
var poster = system.args[3];
var scale = parseInt(system.args[4], 10);
var localServerPort = 4444;

var page = require('webpage').create();
page.settings.localToRemoteUrlAccessEnabled = true;
page.viewportSize = { width: 9999, height: 9999 };
page.zoomFactor = scale;

var server;

if (!(/^https?:\/\//.test(jsonUrl))) {
  console.log('Input is local file, starting server...');

  var path = jsonUrl;
  jsonUrl = "http://localhost:" + localServerPort + "/";

  server = require('webserver').create();
  server.listen(localServerPort, function(request, response) {
    try {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.write(fs.read(path));
      response.close();
    } catch (e) {
      console.log("Error serving asciicast file:", e);
      response.statusCode = 500;
      response.write('');
      response.close();
    }
  });
}

function exit(code) {
  if (server) {
    console.log('Shutting down local server...');
    server.close();
  }

  var code = code === undefined ? 0 : code;
  phantom.exit(code);
}

page.onConsoleMessage = function(msg) {
  console.log('console.log: ' + msg);
};

page.onError = function(msg, trace) {
  console.log('Script error: ' + msg);
  exit(1);
};

page.onResourceError = function(resourceError) {
  console.log('Unable to load resource (#' + resourceError.id + ', URL:' + resourceError.url + ')');
  console.log('Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString);
  exit(1);
};

page.onCallback = function(data) {
  var rect = data.rect;

  if (!rect) {
    console.log("Couldn't get geometry of requested DOM element");
    exit(1);
    return;
  }

  page.clipRect = {
    left: rect.left * scale,
    top: rect.top * scale,
    width: rect.width * scale,
    height: rect.height * scale
  };

  setTimeout(function () {
    page.render(imagePath);
    exit(0);
  }, 10); // need to wait a bit for poster to render
};

page.open(pageUrl, function(status) {
  if (status !== "success") {
    console.log("Failed to load " + url);
    exit(1);
  }

  var rect = page.evaluate(function(jsonUrl, poster) {
    var opts = {
      preload: true,
      poster: poster,
      onCanPlay: function() {
        var elements = document.querySelectorAll('.asciinema-player');

        if (elements.length > 0) {
          window.callPhantom({ rect: elements[0].getBoundingClientRect() });
        } else {
          window.callPhantom({ rect: undefined });
        }
      }
    };

    asciinema.player.js.CreatePlayer('player', jsonUrl, opts);
  }, jsonUrl, poster);
});

// vim: ft=javascript
