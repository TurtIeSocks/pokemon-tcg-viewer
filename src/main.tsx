import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./app.tsx";

// biome-ignore lint/style/noNonNullAssertion: known to be there
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter basename={import.meta.env.BASE_URL}>
			<App />
		</BrowserRouter>
	</StrictMode>,
);
