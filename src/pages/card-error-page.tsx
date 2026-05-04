import { isRouteErrorResponse, Link, useRouteError } from "react-router";

export function CardErrorPage() {
	const error = useRouteError();
	const isNotFound = isRouteErrorResponse(error) && error.status === 404;
	return (
		<div className="card-error">
			<h1>{isNotFound ? "Card not found" : "Something went wrong"}</h1>
			<p>
				{isNotFound
					? "We couldn't find that card."
					: "Try refreshing or come back later."}
			</p>
			<Link to="/">← Back home</Link>
		</div>
	);
}
