import { Types } from "mongoose";
import { User } from "../../models";
import { IUser } from "../../models/User";

export class UserRepository {
  findAll() {
    return User.find().select("-passwordHash").sort({ createdAt: -1 });
  }

  findById(id: string) {
    return User.findById(id).select("-passwordHash");
  }

  findByEmployeeId(employeeId: string) {
    return User.findOne({ employeeId });
  }

  create(data: Partial<IUser>) {
    return User.create(data);
  }

  update(id: string, data: Partial<IUser>) {
    return User.findByIdAndUpdate(id, data, { new: true }).select(
      "-passwordHash",
    );
  }

  deleteById(id: string) {
    return User.findByIdAndDelete(id);
  }

  toDto(user: IUser | (IUser & { _id: Types.ObjectId })) {
    return {
      id: user._id.toString(),
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
      role: user.role,
      subjectIds: user.subjectIds.map((id) => id.toString()),
      departmentIds: user.departmentIds.map((id) => id.toString()),
      isActive: user.isActive,
    };
  }
}

export const userRepository = new UserRepository();
