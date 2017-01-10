#!/usr/bin/env phantomjs

var system = require('system');

if (system.args.length < 6) {
  console.log("usage: " + system.args[0] + " <asciicast-url> <image-path> <format> <poster> <selector> <scale>");
  console.log("   ex: " + system.args[0] + " demo.json shot.png png npt:10 '#player' 2");
  phantom.exit(1);
}

var url = "gen-png.html";
var asciicastUrl = system.args[1];
var imagePath = system.args[2];
var format = system.args[3];
var poster = system.args[4];
var selector = system.args[5];
var scale = parseInt(system.args[6], 10);

var page = require('webpage').create();
page.settings.localToRemoteUrlAccessEnabled = true;
page.settings.ignoreSslErrors = true;
page.settings.webSecurityEnabled = false;

page.viewportSize = { width: 9999, height: 9999 };
page.zoomFactor = scale;

page.onConsoleMessage = function(msg) {
  console.log('console.log: ' + msg);
};

page.onError = function(msg, trace) {
  console.log('Script error: ' + msg);
  phantom.exit(1);
};

page.onResourceError = function(resourceError) {
  console.log('Unable to load resource (#' + resourceError.id + ', URL:' + resourceError.url + ')');
  console.log('Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString);
  phantom.exit(1);
};

page.open(url, function(status) {
  if (status !== "success") {
    console.log("Failed to load " + url);
    phantom.exit(1);
  }

  var rect = page.evaluate(function(asciicastUrl, poster, selector) {
    asciinema.player.js.CreatePlayer('player', asciicastUrl, { preload: true, poster: poster });

    var elements = document.querySelectorAll(selector);

    if (elements.length > 0) {
      return elements[0].getBoundingClientRect();
    }
  }, asciicastUrl, poster, selector);

  if (!rect) {
    console.log("Couldn't get geometry of requested DOM element");
    phantom.exit(1);
    return;
  }

  page.clipRect = {
    left: rect.left * scale,
    top: rect.top * scale,
    width: rect.width * scale,
    height: rect.height * scale
  };

  // console.log("waiting");
  setTimeout(function () {
    // console.log("rendering");
    page.render(imagePath, { format: format });
    phantom.exit(0);

  }, 2000);
});

// vim: ft=javascript
