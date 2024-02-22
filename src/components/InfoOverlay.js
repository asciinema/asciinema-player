export default (props) => {
  const style = () => {
    return { "font-family": props.fontFamily };
  };

  return (
    <div class="ap-overlay ap-overlay-info bg-default">
      <span class="fg-default" style={style()}>
        {props.message}
      </span>
    </div>
  );
};
