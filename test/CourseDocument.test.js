const CourseDocument = artifacts.require("CourseDocument");
const Auth = artifacts.require("Auth");

contract("CourseDocument", (accounts) => {
  const admin = accounts[0];
  const instructor1 = accounts[1];
  const instructor2 = accounts[2];
  const student = accounts[3];
  const dean = accounts[4];
  
  let courseDocInstance;
  let authInstance;
  
  const courseId = "CS101";
  const courseName = "Introduction to Computer Science";
  const courseDescription = "Basic programming concepts";
  
  before(async () => {
    // Deploy contracts
    authInstance = await Auth.deployed();
    courseDocInstance = await CourseDocument.deployed();
    
    // Set Auth contract address in CourseDocument
    await courseDocInstance.setAuthContract(authInstance.address, { from: admin });
    
    // Register users
    await authInstance.register("Admin User", "instructor", { from: admin });
    await authInstance.register("Professor Smith", "instructor", { from: instructor1 });
    await authInstance.register("John Student", "student", { from: student });
    await authInstance.register("John Student", "dean", { from: dean });
    
    // Add instructor2 manually
    await courseDocInstance.addInstructor(instructor2, { from: admin });
  });
  
  describe("Course Management", () => {
    it("should create a course successfully", async () => {
      const now = Math.floor(Date.now() / 1000);
      
      const result = await courseDocInstance.createCourse(
        courseId, 
        courseName, 
        instructor1, 
        true, 
        courseDescription, 
        now, 
        now,
        { from: instructor1 }
      );
      
      // Check event was emitted
      assert.equal(result.logs[0].event, "CourseCreated", "CourseCreated event should be emitted");
      // Don't check the indexed courseId since it's stored as a hash
      assert.equal(result.logs[0].args.courseName, courseName, "Course name should match");
      assert.equal(result.logs[0].args.instructor, instructor1, "Instructor should match");
      
      // Check course data by directly accessing the mapping
      const course = await courseDocInstance.courses(courseId);
      assert.equal(course.courseId, courseId, "Course ID should match");
      assert.equal(course.courseName, courseName, "Course name should match");
      assert.equal(course.description, courseDescription, "Description should match");
      assert.equal(course.isActive, true, "Course should be active");
    });
    
    it("should update a course successfully", async () => {
      const newName = "Advanced CS";
      const newDesc = "Updated description";
      
      await courseDocInstance.updateCourse(
        courseId,
        newName,
        newDesc,
        true,
        { from: instructor1 }
      );
      
      const course = await courseDocInstance.courses(courseId);
      assert.equal(course.courseName, newName, "Course name should be updated");
      assert.equal(course.description, newDesc, "Description should be updated");
    });
    
    it("should transfer course ownership", async () => {
      // Register instructor2 properly in Auth
      await authInstance.register("Professor Johnson", "instructor", { from: instructor2 });
      
      await courseDocInstance.transferCourseOwnership(
        courseId,
        instructor2,
        { from: instructor1 }
      );
      
      const course = await courseDocInstance.courses(courseId);
      assert.equal(course.instructor, instructor2, "Course instructor should be updated");
    });
    
    it("should enroll a student in a course", async () => {
      await courseDocInstance.enrollStudent(courseId, student, { from: instructor2 });
      
      // We can't directly check enrollment as it's a nested mapping
      // but we'll test this indirectly in document access tests
    });
  });
  
  describe("Document Management", () => {
    let documentId;
    const title = "Lecture Notes";
    const description = "Week 1 lecture notes";
    const ipfsHash = "QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t";
    
    it("should upload a document successfully", async () => {
      const result = await courseDocInstance.uploadDocument(
        title,
        description,
        ipfsHash,
        true, // isPublic
        courseId,
        { from: instructor2 }
      );
      
      // Get document ID from event
      documentId = result.logs[0].args.documentId;
      
      // Check event
      assert.equal(result.logs[0].event, "DocumentUploaded", "DocumentUploaded event should be emitted");
      assert.equal(result.logs[0].args.title, title, "Title should match");
      assert.equal(result.logs[0].args.owner, instructor2, "Owner should match");
      
      // Check course documents
      const docs = await courseDocInstance.getDocumentsByCourse(courseId);
      assert.equal(docs.length, 1, "Course should have 1 document");
      assert.equal(docs[0], documentId, "Document ID should match");
    });
    
    it("should retrieve document details correctly", async () => {
      const doc = await courseDocInstance.getDocument(documentId, { from: instructor2 });
      
      assert.equal(doc.title, title, "Title should match");
      assert.equal(doc.description, description, "Description should match");
      assert.equal(doc.ipfsHash, ipfsHash, "IPFS hash should match");
      assert.equal(doc.owner, instructor2, "Owner should match");
      assert.equal(doc.isPublic, true, "isPublic should match");
    });
    
    it("should add a document version successfully", async () => {
      const newHash = "QmNewHash123456789";
      const changeNote = "Updated with corrections";
      
      const result = await courseDocInstance.addDocumentVersion(
        documentId,
        newHash,
        changeNote,
        { from: instructor2 }
      );
      
      // Check event
      assert.equal(result.logs[0].event, "DocumentVersionAdded", "DocumentVersionAdded event should be emitted");
      assert.equal(result.logs[0].args.documentId, documentId, "Document ID should match");
      assert.equal(result.logs[0].args.ipfsHash, newHash, "IPFS hash should match");
      
      // Check document versions
      const versions = await courseDocInstance.getDocumentVersions(documentId);
      assert.equal(versions[0].length, 2, "Should have 2 versions");
      assert.equal(versions[0][0], ipfsHash, "First version hash should match");
      assert.equal(versions[0][1], newHash, "Second version hash should match");
      assert.equal(versions[1][0], "Initial version", "First version note should match");
      assert.equal(versions[1][1], changeNote, "Second version note should match");
    });
    
    it("should allow student to review document", async () => {
      // Review the document
      const rating = 4;
      const comment = "Great content!";
      
      const result = await courseDocInstance.reviewDocument(
        documentId,
        rating,
        comment,
        { from: student }
      );
      
      // Check event
      assert.equal(result.logs[0].event, "DocumentReviewed", "DocumentReviewed event should be emitted");
      assert.equal(result.logs[0].args.documentId, documentId, "Document ID should match");
      assert.equal(result.logs[0].args.reviewer, student, "Reviewer should match");
      assert.equal(result.logs[0].args.rating, rating, "Rating should match");
      
      // Check review data
      const reviews = await courseDocInstance.getDocumentReviews(documentId);
      assert.equal(reviews[0].length, 1, "Should have 1 review");
      assert.equal(reviews[0][0], student, "Reviewer should match");
      assert.equal(reviews[1][0], rating, "Rating should match");
      assert.equal(reviews[2][0], comment, "Comment should match");
    });
  });
  
  describe("Admin Functions", () => {
    it("should toggle contract pause state", async () => {
      // Initially not paused
      let isPaused = await courseDocInstance.contractPaused();
      assert.equal(isPaused, false, "Contract should not be paused initially");
      
      // Pause the contract
      await courseDocInstance.toggleContractPause({ from: admin });
      
      isPaused = await courseDocInstance.contractPaused();
      assert.equal(isPaused, true, "Contract should be paused");
      
      // Try to upload document while paused
      try {
        await courseDocInstance.uploadDocument(
          "Paused Test",
          "Should fail",
          "hash123",
          true,
          courseId,
          { from: instructor1 }
        );
        assert.fail("Should throw an error when paused");
      } catch (error) {
        assert.include(error.message, "Contract is paused", "Should fail with correct message");
      }
      
      // Unpause
      await courseDocInstance.toggleContractPause({ from: admin });
      isPaused = await courseDocInstance.contractPaused();
      assert.equal(isPaused, false, "Contract should be unpaused");
    });
    
    it("should not allow non-admin to pause contract", async () => {
      try {
        await courseDocInstance.toggleContractPause({ from: instructor1 });
        assert.fail("Should throw an error");
      } catch (error) {
        assert.include(error.message, "Only admin can perform this action", "Should fail with correct message");
      }
    });
  });
});