export default (props) => {
  const style = () => {
    return { "font-family": props.fontFamily };
  };

  return (
    <div class="ap-overlay ap-overlay-info">
      <span style={style()}>{props.message}</span>
    </div>
  );
};
