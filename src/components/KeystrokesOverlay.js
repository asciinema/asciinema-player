export default props => {

  return (
    <div class="ap-overlay ap-overlay-keystrokes" id="keystrokes" style ref={props.ref}>
      <div>
        <kbd>{ props.keystroke }</kbd>
      </div>
    </div>
  );
}
