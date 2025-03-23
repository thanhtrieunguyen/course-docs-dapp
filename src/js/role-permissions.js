const RolePermissions = {
    permissions: {
        'admin': {
            canViewDocuments: true,
            canEditDocuments: true,
            canDeleteDocuments: true,
            canFlagDocuments: true,
            canVerifyDocuments: true,
            canAccessDocumentManagement: true,
            canAccessUserManagement: true,
            canAccessRoleManagement: true,
            canAccessSystemConfig: true // Thêm quyền truy cập tab "Cấu hình hệ thống"
        },
        'dean': {
            canViewDocuments: true,
            canEditDocuments: true,
            canDeleteDocuments: false, // Trưởng khoa không được xóa tài liệu
            canFlagDocuments: true,
            canVerifyDocuments: true,
            canAccessDocumentManagement: true,
            canAccessUserManagement: false,
            canAccessRoleManagement: true,
            canAccessSystemConfig: false
        },
        'teacher': {
            canViewDocuments: true,
            canEditDocuments: true,
            canDeleteDocuments: false,
            canFlagDocuments: true,
            canVerifyDocuments: false,
            canAccessDocumentManagement: true,
            canAccessUserManagement: false,
            canAccessRoleManagement: false,
            canAccessSystemConfig: false
        },
        'student': {
            canViewDocuments: true,
            canEditDocuments: false,
            canDeleteDocuments: false,
            canFlagDocuments: true,
            canVerifyDocuments: false,
            canAccessDocumentManagement: false,
            canAccessUserManagement: false,
            canAccessRoleManagement: false,
            canAccessSystemConfig: false
        }
    },

    hasPermission: function (role, permission) {
        return this.permissions[role] && this.permissions[role][permission] === true;
    },

    applyPermissions: function () {
        const user = AuthApp.getCurrentUser();
        if (!user || !user.role) return;

        const role = user.role;
        const permissions = this.permissions[role] || {};

        // Ẩn các chức năng dựa trên quyền
        if (!permissions.canEditDocuments) {
            const editElements = document.querySelectorAll('[data-permission="editDocument"]');
            editElements.forEach(el => el.classList.add('hidden'));
        }
        if (!permissions.canDeleteDocuments) {
            const deleteElements = document.querySelectorAll('[data-permission="deleteDocument"]');
            deleteElements.forEach(el => el.classList.add('hidden'));
        }
        if (!permissions.canFlagDocuments) {
            const flagElements = document.querySelectorAll('[data-permission="flagDocument"]');
            flagElements.forEach(el => el.classList.add('hidden'));
        }
        if (!permissions.canVerifyDocuments) {
            const verifyElements = document.querySelectorAll('[data-permission="verifyDocument"]');
            verifyElements.forEach(el => el.classList.add('hidden'));
        }
        if (!permissions.canViewDocuments) {
            const viewElements = document.querySelectorAll('[data-permission="viewDocument"]');
            viewElements.forEach(el => el.classList.add('hidden'));
        }

        // Ẩn các tab điều hướng không được phép truy cập
        if (!permissions.canAccessUserManagement) {
            const userManagementTab = document.querySelector('a[href="user-management.html"]');
            if (userManagementTab) userManagementTab.classList.add('hidden');
        }
        if (!permissions.canAccessRoleManagement) {
            const roleManagementTab = document.querySelector('a[href="role-management.html"]');
            if (roleManagementTab) roleManagementTab.classList.add('hidden');
        }
        if (!permissions.canAccessSystemConfig) {
            const systemConfigTab = document.querySelector('a[href="cauhinh.html"]');
            if (systemConfigTab) systemConfigTab.classList.add('hidden');
        }
        if (!permissions.canAccessDocumentManagement) {
            const documentManagementTab = document.querySelector('a[href="document-management.html"]');
            if (documentManagementTab) documentManagementTab.classList.add('hidden');
        }

        // Xử lý các phần tử theo class dựa trên vai trò
            const adminOnlyElements = document.querySelectorAll('.admin-only');
            const adminDeanOnlyElements = document.querySelectorAll('.admin-dean-only');

            // Nếu không phải admin, ẩn các phần tử admin-only
            if (role !== 'admin') {
                adminOnlyElements.forEach(el => el.classList.add('hidden'));
            }

            // Nếu không phải admin hoặc dean, ẩn các phần tử admin-dean-only
            if (role !== 'admin' && role !== 'dean') {
                adminDeanOnlyElements.forEach(el => el.classList.add('hidden'));
            }

            // Debug
            console.log('Current user role:', role);
            console.log('Permissions applied for role:', role, permissions);
    }
};