import { loginAction } from "./actions";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-center text-3xl font-bold">
          Nexus ERP
        </h1>

        <form action={loginAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Email
            </label>

            <input
              name='email'
              type="email"
              className="w-full rounded-lg border p-3"
              placeholder="admin@nexuserp.local"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Password
            </label>

            <input
              name='password'
              type="password"
              className="w-full rounded-lg border p-3"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-black p-3 text-white"
          >
            Accedi
          </button>
        </form>
      </div>
    </main>
  );
}