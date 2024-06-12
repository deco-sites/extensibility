import { Section } from "deco/blocks/section.ts";

interface Props {
  /**
  * @description The description of name.
  */
  name?: string;
  sectionssss: Section[];
}

export default function Section({ name = "Capy" }: Props) {
  return <div>Hello {name}</div>
}