export default (props) => {
  return (
    <div
      class={
        props.isKeystrokeFading
          ? "ap-overlay ap-overlay-keystrokes fading"
          : "ap-overlay ap-overlay-keystrokes"
      }
      id="keystrokes"
      style
      ref={props.ref}
    >
      <div>
        <kbd>{props.keystroke}</kbd>
      </div>
    </div>
  );
};
