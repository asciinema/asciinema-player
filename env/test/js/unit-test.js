var system = require('system');
var page = require('webpage').create();
var url = system.args[0];

page.onConsoleMessage = function (message) {
  console.log(message);
};

function exit(code) {
  setTimeout(function(){ phantom.exit(code); }, 0);
  phantom.onError = function(){};
}

console.log("Loading URL: " + url);

page.open(url, function (status) {
  if (status != "success") {
    console.log('Failed to open ' + url);
    phantom.exit(1);
  }

  console.log("Running test.");

  var result = page.evaluate(function() {
    return asciinema_player.test_runner.runner();
  });

  if (result != 0) {
    console.log("*** Test failed! ***");
    exit(1);
  }
  else {
	  console.log("Test succeeded.");
	  exit(0);
  }

});
