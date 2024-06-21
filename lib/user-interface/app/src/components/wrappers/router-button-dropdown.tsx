import {
  ButtonDropdownProps,
  ButtonDropdown,
} from "@cloudscape-design/components";
import useOnFollow from "../../common/hooks/use-on-follow";


interface CustomDropdownProps extends ButtonDropdownProps {
  style?: React.CSSProperties;
  className?: string;
}

export default function RouterButtonDropdown(props: CustomDropdownProps) {
  const onFollow = useOnFollow();

  return <ButtonDropdown {...props} onItemFollow={onFollow} />;
}
