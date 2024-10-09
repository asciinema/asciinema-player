export default (props) => {
  const style = () => {
    return { "font-family": props.fontFamily };
  };

  const e = (f) => {
    return (e) => {
      e.preventDefault();
      f(e);
    };
  };

  return (
    <div class="ap-overlay ap-overlay-help" style={style()} onClick={e(props.onClose)}>
      <div
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div>
          <p>Keyboard shortcuts</p>

          <ul>
            <Show when={props.isPausable}>
              <li>
                <kbd>space</kbd> - pause / resume
              </li>
            </Show>

            <Show when={props.isSeekable}>
              <li>
                <kbd>←</kbd> / <kbd>→</kbd> - rewind / fast-forward by 5 seconds
              </li>

              <li>
                <kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd> - rewind / fast-forward by 10%
              </li>

              <li>
                <kbd>[</kbd> / <kbd>]</kbd> - jump to the previous / next marker
              </li>

              <li>
                <kbd>0</kbd>, <kbd>1</kbd>, <kbd>2</kbd> ... <kbd>9</kbd> - jump to 0%, 10%, 20% ...
                90%
              </li>

              <li>
                <kbd>,</kbd> / <kbd>.</kbd> - step back / forward, a frame at a time (when paused)
              </li>
            </Show>

            <li>
              <kbd>f</kbd> - toggle fullscreen mode
            </li>
            <li>
              <kbd>k</kbd> - toggle keystroke popup
            </li>
            <li>
              <kbd>?</kbd> - toggle this help popup
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
