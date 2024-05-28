import { usePartialSection } from "deco/hooks/usePartialSection.ts";

export interface Props {
  /**
   * @format rich-text
   */
  name?: string;
  /**
   * @format rich-text
   */
  description?: string;
}

export default function Section({ name = "It Works!", description }: Props) {
  return (
    <div
      id="it-works"
      class="container py-10 flex flex-col h-screen w-full items-center justify-center gap-16"
    >
      <div
        class="leading-10 text-6xl"
        dangerouslySetInnerHTML={{
          __html: name,
        }}
      />
      <div
        dangerouslySetInnerHTML={{
          __html: description,
        }}
      />
    </div>
  );
}
