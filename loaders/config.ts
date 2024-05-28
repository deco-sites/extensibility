import { allowCorsFor } from "deco/mod.ts";
import { AppContext } from "../apps/site.ts";

export interface WithTraffic<T> {
  /**
   * @maxItems 2
   */
  content: T[];
  traffic?: number;
  /**
   * @title Run parallel with other tests
   * @default true
   */
  runParallel?: boolean;
}

interface Props {
  text: WithTraffic<string>;
  showMenu: WithTraffic<boolean>;
}

type Returns = Props;

export default function loader(
  props: Props,
  req: Request,
  ctx: AppContext,
): Returns {
  Object.entries(allowCorsFor(req)).map(([name, value]) => {
    ctx.response.headers.set(name, value);
  });

  return props;
}
