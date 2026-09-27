// Placeholder profile until real auth is wired up. Anything that needs "the
// signed-in user" (the sidebar, who approved a query) reads it from here, so
// swapping in a real session is a one-file change.
export const currentUser = {
  name: "Rahul",
  email: "user@example.com",
  avatar: "",
}
