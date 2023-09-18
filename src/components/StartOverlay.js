export default props => {
  const e = (f) => { return e => { e.preventDefault(); f(e); } };

  return (
    <div class="ap-overlay ap-overlay-start" onClick={e(props.onClick)}>
      <div class="ap-play-button">
        <div>
          <span>
            <svg version="1.1" viewBox="0 0 1000.0 1000.0" class="ap-icon">
              <defs>
                <mask id="small-triangle-mask">
                  <rect width="100%" height="100%" fill="white"></rect>
                  <polygon points="700.0 500.0, 400.00000000000006 326.7949192431122, 399.9999999999999 673.2050807568877" fill="black"></polygon>
                </mask>
              </defs>
              <polygon points="1000.0 500.0, 250.0000000000001 66.98729810778059, 249.99999999999977 933.0127018922192" mask="url(#small-triangle-mask)" fill="white" class="ap-play-btn-fill"></polygon>
              <polyline points="673.2050807568878 400.0, 326.7949192431123 600.0" stroke="white" stroke-width="90" class="ap-play-btn-stroke"></polyline>
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
