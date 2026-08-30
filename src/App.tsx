import appUIJson from "../app-ui/app-ui.json";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import { LayoutRenderer } from "../runtime/layout";

import "./styles.css";

const appUIModel = parseAppUIModel(appUIJson);

export function App() {
  return (
    <main className="development-preview">
      <LayoutRenderer
        model={appUIModel}
        renderSlot={(slot) => (
          <section className="development-preview-slot">
            <div>
              <span>Slot</span>
              <h2>{slot.slotId}</h2>
            </div>
            <p>
              {slot.pluginInstanceIds.length === 0
                ? "No plugin instances"
                : slot.pluginInstanceIds.join(", ")}
            </p>
          </section>
        )}
      />
    </main>
  );
}
