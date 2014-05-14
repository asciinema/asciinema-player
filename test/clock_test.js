describe("Clock", function() {

  describe("#render()", function() {

    function render(props) {
      return ReactTestUtils.renderIntoDocument(asciinema.Clock(props));
    };

    it("should render remaining time when totalTime given", function() {
      var clock, $clock;

      clock = render({ currentTime: 66, totalTime: 100 });
      $clock = $(clock.getDOMNode());

      expect($clock.text()).to.eq(' 00:34 ');
    });

    it("should render current time when no totalTime given", function() {
      var clock, $clock;

      clock = render({ currentTime: 33 });
      $clock = $(clock.getDOMNode());

      expect($clock.text()).to.eq(' 00:33 ');
    });

    it("should render 00:00 when currentTime > totalTime", function() {
      var clock, $clock;

      clock = render({ currentTime: 34, totalTime: 33 });
      $clock = $(clock.getDOMNode());

      expect($clock.text()).to.eq(' 00:00 ');
    });

  });

});
