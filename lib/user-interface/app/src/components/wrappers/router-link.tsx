import { Link, LinkProps } from "@cloudscape-design/components";
import useOnFollow from "../../common/hooks/use-on-follow";

interface CustomLinkProps extends LinkProps {
  style?: React.CSSProperties;
  className?: string;
}

export default function RouterLink(props: CustomLinkProps) {
  const onFollow = useOnFollow();

  return <Link {...props} onFollow={onFollow} />;
}
