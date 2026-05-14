import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createUser,
  fetchUsers,
  updateUser,
  type CreateUserInput,
  type UpdateUserInput,
} from "./api";

export const userKeys = {
  list: ["users"] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: userKeys.list,
    queryFn: fetchUsers,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: userKeys.list }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => updateUser(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: userKeys.list }),
  });
}
