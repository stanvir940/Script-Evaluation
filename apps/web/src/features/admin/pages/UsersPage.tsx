import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  DepartmentDto,
  SubjectDto,
  UserDto,
  UserRole,
} from "@dasems/shared-types";
import { api } from "../../../shared/api/client";
import { AppLayout } from "../../../shared/components/layout/AppLayout";

const userFormSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
  role: z.enum(["SUPER_ADMIN", "HEAD_EXAMINER", "TEACHER"]),
  subjectIds: z.array(z.string()).optional().default([]),
  departmentIds: z.array(z.string()).optional().default([]),
  password: z.string().min(6),
});

const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["SUPER_ADMIN", "HEAD_EXAMINER", "TEACHER"]).optional(),
  subjectIds: z.array(z.string()).optional().default([]),
  departmentIds: z.array(z.string()).optional().default([]),
  password: z.string().min(6).optional(),
  isActive: z.boolean().optional(),
});

type CreateUserForm = z.infer<typeof userFormSchema>;
type UpdateUserForm = z.infer<typeof userUpdateSchema>;

export function UsersPage() {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<DepartmentDto[]>("/departments"),
  });

  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => api.get<SubjectDto[]>("/subjects"),
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<UserDto[]>("/users"),
    refetchInterval: 5000,
  });

  const createUserMutation = useMutation<UserDto, Error, CreateUserForm>({
    mutationFn: (payload) =>
      api.post<UserDto>("/users", {
        employeeId: payload.employeeId,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        password: payload.password,
        subjectIds: payload.subjectIds,
        departmentIds: payload.departmentIds,
        isActive: true,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const updateUserMutation = useMutation<
    UserDto,
    Error,
    { id: string; payload: Record<string, unknown> }
  >({
    mutationFn: ({ id, payload }) =>
      api.patch<UserDto>(`/users/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditingUser(null);
    },
  });

  const deleteUserMutation = useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: (id) => api.delete<{ deleted: boolean }>(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserForm>({
    resolver: zodResolver(userFormSchema),
  });

  const {
    register: registerUpdate,
    handleSubmit: handleSubmitUpdate,
    reset: resetUpdate,
    formState: { errors: updateErrors },
  } = useForm<UpdateUserForm>({
    resolver: zodResolver(userUpdateSchema),
  });

  const roleOptions = useMemo(
    () => [
      { value: "SUPER_ADMIN" as UserRole, label: "Super Admin" },
      { value: "HEAD_EXAMINER" as UserRole, label: "Head Examiner" },
      { value: "TEACHER" as UserRole, label: "Teacher" },
    ],
    [],
  );

  const handleCreate = async (data: CreateUserForm) => {
    await createUserMutation.mutateAsync(data);
    reset();
  };

  const handleEdit = (user: UserDto) => {
    setEditingUser(user);
    resetUpdate({
      name: user.name,
      email: user.email ?? undefined,
      role: user.role,
      subjectIds: user.subjectIds,
      departmentIds: user.departmentIds,
      isActive: user.isActive,
    });
  };

  const handleUpdate = async (data: UpdateUserForm) => {
    if (!editingUser) return;
    await updateUserMutation.mutateAsync({
      id: editingUser.id,
      payload: {
        name: data.name,
        email: data.email,
        role: data.role,
        password: data.password,
        isActive: data.isActive,
        subjectIds: data.subjectIds,
        departmentIds: data.departmentIds,
      },
    });
  };

  const handleDeactivate = async (user: UserDto) => {
    await updateUserMutation.mutateAsync({
      id: user.id,
      payload: { isActive: !user.isActive },
    });
  };

  const handleDelete = async (user: UserDto) => {
    await deleteUserMutation.mutateAsync(user.id);
  };

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Users</h1>
            <p className="text-sm text-text-muted">
              Manage teachers and head examiners from MongoDB.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6 mb-6">
          <div className="panel p-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingUser ? "Edit User" : "Create User"}
            </h2>
            <form
              onSubmit={
                editingUser
                  ? handleSubmitUpdate(handleUpdate)
                  : handleSubmit(handleCreate)
              }
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Employee ID
                </label>
                <input
                  type="text"
                  className="input-field"
                  {...register("employeeId")}
                  disabled={Boolean(editingUser)}
                />
                <p className="text-sm text-danger mt-1">
                  {errors.employeeId?.message}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  {...(editingUser ? registerUpdate("name") : register("name"))}
                />
                <p className="text-sm text-danger mt-1">
                  {(editingUser ? updateErrors.name : errors.name)?.message}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Email
                </label>
                <input
                  type="email"
                  className="input-field"
                  {...(editingUser
                    ? registerUpdate("email")
                    : register("email"))}
                />
                <p className="text-sm text-danger mt-1">
                  {(editingUser ? updateErrors.email : errors.email)?.message}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Role
                </label>
                <select
                  className="input-field"
                  {...(editingUser ? registerUpdate("role") : register("role"))}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-danger mt-1">
                  {(editingUser ? updateErrors.role : errors.role)?.message}
                </p>
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    {...register("password")}
                  />
                  <p className="text-sm text-danger mt-1">
                    {errors.password?.message}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Subjects
                </label>
                <select
                  multiple
                  className="input-field min-h-[120px]"
                  {...(editingUser
                    ? registerUpdate("subjectIds")
                    : register("subjectIds"))}
                >
                  {subjects?.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.code} — {subject.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-text-muted mt-1">
                  Select one or more subjects for this user.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Departments
                </label>
                <select
                  multiple
                  className="input-field min-h-[120px]"
                  {...(editingUser
                    ? registerUpdate("departmentIds")
                    : register("departmentIds"))}
                >
                  {departments?.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} — {department.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-text-muted mt-1">
                  Select one or more departments for this user.
                </p>
              </div>

              {editingUser && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditingUser(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Save Changes
                  </button>
                </div>
              )}

              {!editingUser && (
                <button type="submit" className="btn-primary w-full">
                  Create User
                </button>
              )}
            </form>
          </div>

          <div className="panel p-6">
            <h2 className="text-lg font-semibold mb-4">User Actions</h2>
            <p className="text-sm text-text-muted mb-4">
              Select a user from the table to edit, activate/deactivate, or
              delete.
            </p>
            <div className="space-y-3">
              {users?.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded border border-border p-3"
                >
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-text-muted">
                      {user.employeeId} • {user.role.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => handleEdit(user)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => handleDeactivate(user)}
                    >
                      {user.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => handleDelete(user)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel p-6">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Subjects</th>
                <th>Departments</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id}>
                  <td>{u.employeeId}</td>
                  <td>{u.name}</td>
                  <td>{u.role.replace(/_/g, " ")}</td>
                  <td>{u.isActive ? "Active" : "Inactive"}</td>
                  <td>{u.subjectIds.join(", ")}</td>
                  <td>{u.departmentIds.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
