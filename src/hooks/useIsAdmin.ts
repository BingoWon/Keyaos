import { useFetch } from "./useFetch";

export function useIsAdmin(): boolean {
	const { data } = useFetch<{ isAdmin: boolean }>("/api/me");
	return data?.isAdmin ?? false;
}
