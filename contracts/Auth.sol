// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Auth {
    struct User {
        string name;
        string email;
        string passwordHash;
        bool registered;
    }

    struct Role {
        string name;
        bool exists;
    }

    mapping(address => User) public users;
    mapping(address => string) private userRoles;
    mapping(string => Role) private roles;
    address[] private userAddresses;

    // Events
    event UserRegistered(
        address indexed userAddress,
        string name,
        uint256 timestamp
    );
    event UserRoleChanged(
        address indexed userAddress,
        string oldRole,
        string newRole,
        uint256 timestamp
    );
    event UserUpdated(address indexed userAddress, string name, string email);

    constructor() {
        // Initialize roles
        roles["admin"] = Role("Administrator", true);
        roles["teacher"] = Role("Teacher", true);
        roles["student"] = Role("Student", true);
        roles["dean"] = Role("dean", true);//đây là role trưởng khoa

        // Set contract deployer as the initial admin
        userRoles[msg.sender] = "admin";
        users[msg.sender] = User(
            "System Admin",
            "admin@example.com",
            "123456",
            true
        );
        userAddresses.push(msg.sender);
    }

    // Modifiers
    modifier onlyAdmin() {
        require(
            keccak256(abi.encodePacked(userRoles[msg.sender])) ==
                keccak256(abi.encodePacked("admin")),
            "Only admin can perform this action"
        );
        _;
    }

    modifier userExists(address _address) {
        require(users[_address].registered, "User does not exist");
        _;
    }

    // Admin Functions
    function setUserRole(
        address _userAddress,
        string memory _role
    ) public onlyAdmin userExists(_userAddress) {
        require(roles[_role].exists, "Role does not exist");

        string memory oldRole = userRoles[_userAddress];
        userRoles[_userAddress] = _role;

        emit UserRoleChanged(_userAddress, oldRole, _role, block.timestamp);
    }

    function createRole(string memory _roleName) public onlyAdmin {
        require(!roles[_roleName].exists, "Role already exists");

        roles[_roleName] = Role(_roleName, true);
    }

    // User Management
    function register(
        string memory _name,
        string memory _email,
        string memory _passwordHash,
        string memory _role
    ) public {
        require(!users[msg.sender].registered, "User already registered");

        users[msg.sender] = User({
            name: _name,
            email: _email,
            passwordHash: _passwordHash,
            registered: true
        });

        userRoles[msg.sender] = _role;
        userAddresses.push(msg.sender);
        emit UserRegistered(msg.sender, _name, block.timestamp);
    }

    function login(string memory _passwordHash) public view returns (bool) {
        require(users[msg.sender].registered, "User not registered");
        User memory user = users[msg.sender];
        return
            keccak256(abi.encodePacked(user.passwordHash)) ==
            keccak256(abi.encodePacked(_passwordHash));
    }

    function roleExists(string memory _role) public view returns (bool) {
        return roles[_role].exists;
    }

    function updateUser(
        string memory _name,
        string memory _email
    ) public userExists(msg.sender) {
        User storage user = users[msg.sender];
        user.name = _name;
        user.email = _email;
    }

    function updatePassword(
        string memory _newPasswordHash
    ) public userExists(msg.sender) {
        User storage user = users[msg.sender];
        user.passwordHash = _newPasswordHash;
    }

    function updateUser(
        address userAddress,
        string memory name,
        string memory email
    ) public onlyAdmin {
        require(isRegistered(userAddress), "User not found");
        users[userAddress].name = name;
        users[userAddress].email = email;
        emit UserUpdated(userAddress, name, email);
    }

    // Access Control Helpers
    function hasRole(
        address _address,
        string memory _role
    ) public view returns (bool) {
        return
            keccak256(abi.encodePacked(userRoles[_address])) ==
            keccak256(abi.encodePacked(_role));
    }

    function getUserRole(address _address) public view returns (string memory) {
        return userRoles[_address];
    }

    function isRegistered(address _address) public view returns (bool) {
        return users[_address].registered;
    }

    function validateCredentials(
        address _userAddress,
        string memory _passwordHash
    ) public view returns (bool) {
        User memory user = users[_userAddress];
        return
            user.registered &&
            keccak256(abi.encodePacked(user.passwordHash)) ==
            keccak256(abi.encodePacked(_passwordHash));
    }

    // User listing (admin only)
    function getUserCount() public view returns (uint256) {
        return userAddresses.length;
    }

    function getUserAtIndex(uint256 _index) public view returns (address) {
        require(_index < userAddresses.length, "Index out of bounds");
        return userAddresses[_index];
    }

    function getUser(
        address _address
    )
        public
        view
        returns (string memory name, string memory email, string memory role)
    {
        require(users[_address].registered, "User not registered");

        User memory user = users[_address];
        return (user.name, user.email, userRoles[_address]);
    }
}
