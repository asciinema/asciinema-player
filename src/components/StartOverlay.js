export default props => {
  const e = (f) => { return e => { e.preventDefault(); f(e); } };

  return (
    <div class="start-prompt" onClick={e(props.onClick)}>
      <div class="play-button">
        <div>
          <span>
            <svg version="1.1" viewBox="0 0 866.0254037844387 866.0254037844387" class="icon">
              <defs>
                <mask id="small-triangle-mask">
                  <rect width="100%" height="100%" fill="white"></rect>
                  <polygon points="508.01270189221935 433.01270189221935, 208.0127018922194 259.8076211353316, 208.01270189221927 606.217782649107" fill="black"></polygon>
                </mask>
              </defs>
              <polygon points="808.0127018922194 433.01270189221935, 58.01270189221947 -1.1368683772161603e-13, 58.01270189221913 866.0254037844386" mask="url(#small-triangle-mask)" fill="white"></polygon>
              <polyline points="481.2177826491071 333.0127018922194, 134.80762113533166 533.0127018922194" stroke="white" stroke-width="90"></polyline>
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
