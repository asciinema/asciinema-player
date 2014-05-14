describe("ProgressBar", function() {

  describe("#render()", function() {

    function render(props) {
      return ReactTestUtils.renderIntoDocument(asciinema.ProgressBar(props));
    };

    it("...", function() {
      var progressBar, $progressBar;

      progressBar = render({ width: 5, currentTime: 0, totalTime: 100 });
      $progressBar = $(progressBar.getDOMNode());

      expect($progressBar.text()).to.eq('[   ]');
    });


    it("...", function() {
      var progressBar, $progressBar;

      progressBar = render({ width: 5, currentTime: 50, totalTime: 100 });
      $progressBar = $(progressBar.getDOMNode());

      expect($progressBar.text()).to.eq('[=> ]');
    });

    it("...", function() {
      var progressBar, $progressBar;

      progressBar = render({ width: 5, currentTime: 25, totalTime: 100 });
      $progressBar = $(progressBar.getDOMNode());

      expect($progressBar.text()).to.eq('[>  ]');
    });

    it("...", function() {
      var progressBar, $progressBar;

      progressBar = render({ width: 5, currentTime: 99, totalTime: 100 });
      $progressBar = $(progressBar.getDOMNode());

      expect($progressBar.text()).to.eq('[==>]');
    });

  });

});
