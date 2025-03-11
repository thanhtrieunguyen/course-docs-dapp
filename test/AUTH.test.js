const Auth = artifacts.require("Auth");

contract("Auth", (accounts) => {
  const owner = accounts[0];
  const student = accounts[1];
  const instructor = accounts[2];
  
  let authInstance;
  
  before(async () => {
    authInstance = await Auth.deployed();
  });
  
  it("should register a student successfully", async () => {
    const result = await authInstance.register("John Doe", "student", { from: student });
    
    // Check if event was emitted
    assert.equal(result.logs[0].event, "UserRegistered", "UserRegistered event should be emitted");
    assert.equal(result.logs[0].args.userAddress, student, "Student address should match");
    assert.equal(result.logs[0].args.name, "John Doe", "Student name should match");
    assert.equal(result.logs[0].args.role, "student", "Role should be student");
    
    // Check if user data is stored correctly
    const userData = await authInstance.getUser(student);
    assert.equal(userData[0], "John Doe", "Name should match");
    assert.equal(userData[1], "student", "Role should match");
    assert.equal(userData[2], true, "User should be registered");
  });
  
  it("should register an instructor successfully", async () => {
    const result = await authInstance.register("Jane Smith", "instructor", { from: instructor });
    
    // Check if event was emitted
    assert.equal(result.logs[0].event, "UserRegistered", "UserRegistered event should be emitted");
    assert.equal(result.logs[0].args.name, "Jane Smith", "Instructor name should match");
    assert.equal(result.logs[0].args.role, "instructor", "Role should be instructor");
    
    // Check if user data is stored correctly
    const userData = await authInstance.getUser(instructor);
    assert.equal(userData[0], "Jane Smith", "Name should match");
    assert.equal(userData[1], "instructor", "Role should match");
    assert.equal(userData[2], true, "User should be registered");
  });
  
  it("should not allow a user to register twice", async () => {
    try {
      await authInstance.register("John Doe Again", "student", { from: student });
      assert.fail("The transaction should have thrown an error");
    } catch (error) {
      assert.include(
        error.message,
        "User already registered",
        "The error message should contain 'User already registered'"
      );
    }
  });
  
  it("should not allow registration with invalid role", async () => {
    try {
      await authInstance.register("Invalid Role User", "admin", { from: accounts[3] });
      assert.fail("The transaction should have thrown an error");
    } catch (error) {
      assert.include(
        error.message,
        "Invalid role",
        "The error message should contain 'Invalid role'"
      );
    }
  });
  
  it("should return correct user data", async () => {
    const userData = await authInstance.getUser(student);
    assert.equal(userData[0], "John Doe", "Name should match");
    assert.equal(userData[1], "student", "Role should match");
    assert.equal(userData[2], true, "isRegistered should be true");
    
    // Check data for an unregistered user
    const unregisteredUser = await authInstance.getUser(accounts[5]);
    assert.equal(unregisteredUser[0], "", "Name should be empty");
    assert.equal(unregisteredUser[1], "", "Role should be empty");
    assert.equal(unregisteredUser[2], false, "isRegistered should be false");
  });
});