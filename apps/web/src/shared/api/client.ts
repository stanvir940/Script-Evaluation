// import { AuthUser, AuthTokens } from "@dasems/shared-types";

// const API_BASE = "/api/v1";

// class ApiClient {
//   private accessToken: string | null = localStorage.getItem("accessToken");
//   private refreshToken: string | null = localStorage.getItem("refreshToken");

//   setTokens(accessToken: string, refreshToken: string) {
//     this.accessToken = accessToken;
//     this.refreshToken = refreshToken;
//     localStorage.setItem("accessToken", accessToken);
//     localStorage.setItem("refreshToken", refreshToken);
//   }

//   clearTokens() {
//     this.accessToken = null;
//     this.refreshToken = null;
//     localStorage.removeItem("accessToken");
//     localStorage.removeItem("refreshToken");
//   }

//   getAccessToken() {
//     return this.accessToken;
//   }

//   private async request<T>(
//     path: string,
//     options: RequestInit = {},
//   ): Promise<T> {
//     const headers: Record<string, string> = {
//       "Content-Type": "application/json",
//       ...(options.headers as Record<string, string>),
//     };

//     if (this.accessToken) {
//       headers.Authorization = `Bearer ${this.accessToken}`;
//     }

//     let response = await fetch(`${API_BASE}${path}`, { ...options, headers });

//     if (
//       response.status === 401 &&
//       this.refreshToken &&
//       !path.includes("/auth/refresh")
//     ) {
//       const refreshed = await this.tryRefresh();
//       if (refreshed) {
//         headers.Authorization = `Bearer ${this.accessToken}`;
//         response = await fetch(`${API_BASE}${path}`, { ...options, headers });
//       }
//     }

//     const body = await response.json();
//     if (!response.ok || !body.success) {
//       throw new Error(body.error || "Request failed");
//     }
//     return body.data as T;
//   }

//   private async tryRefresh(): Promise<boolean> {
//     try {
//       const res = await fetch(`${API_BASE}/auth/refresh`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ refreshToken: this.refreshToken }),
//       });
//       if (!res.ok) {
//         this.clearTokens();
//         return false;
//       }
//       const body = await res.json();
//       this.accessToken = body.data.accessToken;
//       localStorage.setItem("accessToken", body.data.accessToken);
//       return true;
//     } catch {
//       this.clearTokens();
//       return false;
//     }
//   }

//   login(employeeId: string, password: string) {
//     return this.request<AuthTokens>("/auth/login", {
//       method: "POST",
//       body: JSON.stringify({ employeeId, password }),
//     });
//   }

//   logout() {
//     if (!this.refreshToken) return Promise.resolve();
//     return this.request("/auth/logout", {
//       method: "POST",
//       body: JSON.stringify({ refreshToken: this.refreshToken }),
//     }).catch(() => undefined);
//   }

//   getMe() {
//     return this.request<AuthUser>("/auth/me");
//   }

//   get<T>(path: string) {
//     return this.request<T>(path);
//   }

//   post<T>(path: string, body: unknown) {
//     return this.request<T>(path, {
//       method: "POST",
//       body: JSON.stringify(body),
//     });
//   }

//   patch<T>(path: string, body: unknown) {
//     return this.request<T>(path, {
//       method: "PATCH",
//       body: JSON.stringify(body),
//     });
//   }

//   delete<T>(path: string) {
//     return this.request<T>(path, { method: "DELETE" });
//   }
// }

// export const api = new ApiClient();

import { AuthUser, AuthTokens } from "@dasems/shared-types";

const API_BASE = "/api/v1";

class ApiClient {
  private accessToken: string | null = localStorage.getItem("accessToken");
  private refreshToken: string | null = localStorage.getItem("refreshToken");

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  }

  getAccessToken() {
    return this.accessToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    let response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      cache: "no-store",
    });

    if (
      response.status === 401 &&
      this.refreshToken &&
      !path.includes("/auth/refresh")
    ) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers.Authorization = `Bearer ${this.accessToken}`;
        response = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
          cache: "no-store",
        });
      }
    }

    const body = await response.json();
    const isOk = response.ok || response.status === 304;
    if (!isOk || !body.success) {
      throw new Error(body.error || "Request failed");
    }
    return body.data as T;
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
        cache: "no-store",
      });
      if (!res.ok) {
        this.clearTokens();
        return false;
      }
      const body = await res.json();
      this.accessToken = body.data.accessToken;
      localStorage.setItem("accessToken", body.data.accessToken);
      return true;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  login(employeeId: string, password: string) {
    return this.request<AuthTokens>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ employeeId, password }),
    });
  }

  logout() {
    if (!this.refreshToken) return Promise.resolve();
    return this.request("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    }).catch(() => undefined);
  }

  getMe() {
    return this.request<AuthUser>("/auth/me");
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export const api = new ApiClient();
